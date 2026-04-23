import sql from '@lib/neon';

/**
 * Resolves a user search (US state, city, "City, ST", "City ST", or 5-digit zip) to
 * a canonical directory path. Order: zip → two-letter/ exact state name → city (including
 * fuzzy) → fuzzy state only as a last resort. Fuzzy state must not run before city or
 * trigram matches like "missoula" → "Missouri" will beat real city matches.
 */
export async function resolveSearchPath(raw: string): Promise<string | null> {
  const q = raw.trim();
  if (q.length < 2) return null;

  const zipM = q.match(/^(\d{5})(?:-\d{4})?$/);
  if (zipM) {
    return resolveZip(zipM[1]!);
  }

  const stateExact = await resolveStateExact(q);
  if (stateExact) return stateExact;

  const cityPath = await resolveCityName(q);
  if (cityPath) return cityPath;

  return resolveStateFuzzy(q);
}

/** US state from two-letter code or full name only (no trigram / fuzzy). */
async function resolveStateExact(term: string): Promise<string | null> {
  if (term.length === 2 && /^[A-Za-z]{2}$/.test(term)) {
    const byCode = await sql`
      SELECT slug FROM states
      WHERE code = ${term.toUpperCase()}
      LIMIT 1
    `;
    if (byCode[0]) {
      return `/shops/${byCode[0].slug}/`;
    }
  }

  const exact = await sql`
    SELECT slug FROM states
    WHERE LOWER(TRIM(name)) = LOWER(${term})
    LIMIT 1
  `;
  if (exact[0]) {
    return `/shops/${exact[0].slug}/`;
  }

  return null;
}

/** Fuzzy / partial state name only when no city matched (typos, "Oreg", etc.). */
async function resolveStateFuzzy(term: string): Promise<string | null> {
  if (term.length < 3) {
    return null;
  }

  const rows = await sql`
    SELECT slug, similarity(name, ${term}) AS sim
    FROM states
    WHERE (name % ${term} OR name ILIKE ${'%' + term + '%'})
    ORDER BY
      (LOWER(TRIM(name)) = LOWER(${term})) DESC,
      (name ILIKE ${term + '%'}) DESC,
      sim DESC,
      shop_count DESC NULLS LAST
    LIMIT 1
  `;
  if (rows[0]) {
    return `/shops/${rows[0].slug}/`;
  }

  return null;
}

async function resolveZip(zip: string): Promise<string | null> {
  const withCityPage = await sql`
    SELECT c.slug as city_slug, st.slug as state_slug
    FROM shops s
    JOIN cities c ON c.name = s.city AND c.state_code = s.state_code
    JOIN states st ON st.code = s.state_code
    WHERE s.zip = ${zip}
      AND c.has_dedicated_page = true
      AND (s.google_business_status IS NULL OR s.google_business_status != 'CLOSED_PERMANENTLY')
      AND COALESCE(s.listing_status, 'active') = 'active'
    ORDER BY s.google_rating DESC NULLS LAST
    LIMIT 1
  `;
  if (withCityPage[0]) {
    return `/shops/${withCityPage[0].state_slug}/${withCityPage[0].city_slug}/`;
  }

  const anyShop = await sql`
    SELECT c.slug as city_slug, st.slug as state_slug, c.has_dedicated_page, s.slug as shop_slug
    FROM shops s
    JOIN cities c ON c.name = s.city AND c.state_code = s.state_code
    JOIN states st ON st.code = s.state_code
    WHERE s.zip = ${zip}
      AND (s.google_business_status IS NULL OR s.google_business_status != 'CLOSED_PERMANENTLY')
      AND COALESCE(s.listing_status, 'active') = 'active'
    ORDER BY c.has_dedicated_page DESC, s.google_rating DESC NULLS LAST
    LIMIT 1
  `;
  const row = anyShop[0] as
    | { city_slug: string; state_slug: string; has_dedicated_page: boolean; shop_slug: string }
    | undefined;
  if (!row) return null;
  if (row.has_dedicated_page) {
    return `/shops/${row.state_slug}/${row.city_slug}/`;
  }
  return `/shops/${row.state_slug}/${row.city_slug}/${row.shop_slug}/`;
}

async function resolveStateCodeFromInput(input: string): Promise<string | null> {
  const term = input.trim();
  if (!term) return null;
  if (term.length === 2 && /^[A-Za-z]{2}$/.test(term)) {
    return term.toUpperCase();
  }
  const rows = await sql`
    SELECT code
    FROM states
    WHERE LOWER(TRIM(name)) = LOWER(${term})
    LIMIT 1
  `;
  return rows[0]?.code ?? null;
}

async function splitCityAndState(term: string): Promise<{ name: string; state: string } | null> {
  const t = term.trim();
  const comma = t.match(/^(.+?),\s*(.+?)\s*$/i);
  if (comma) {
    const stateCode = await resolveStateCodeFromInput(comma[2]!);
    if (stateCode) {
      return { name: comma[1]!.trim(), state: stateCode };
    }
    return null;
  }

  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /^[A-Za-z]{2}$/i.test(parts[parts.length - 1]!)) {
    const last = parts[parts.length - 1]!;
    return {
      name: parts.slice(0, -1).join(' '),
      state: last.toUpperCase(),
    };
  }

  for (let n = 3; n >= 1; n--) {
    if (parts.length <= n) continue;
    const stateCandidate = parts.slice(-n).join(' ');
    const stateCode = await resolveStateCodeFromInput(stateCandidate);
    if (stateCode) {
      return {
        name: parts.slice(0, -n).join(' '),
        state: stateCode,
      };
    }
  }

  return null;
}

async function resolveCityName(term: string): Promise<string | null> {
  const parts = await splitCityAndState(term);
  if (parts && parts.name.length > 0) {
    const byState = await resolveCityInState(parts.name, parts.state);
    if (byState) return byState;
  }

  const nameOnly = parts ? parts.name : term.trim();
  if (!nameOnly) return null;

  const direct = await sql`
    SELECT c.slug, st.slug as state_slug
    FROM cities c
    JOIN states st ON st.code = c.state_code
    WHERE c.has_dedicated_page = true
      AND LOWER(TRIM(c.name)) = LOWER(${nameOnly})
    ORDER BY c.shop_count DESC NULLS LAST
    LIMIT 1
  `;
  if (direct[0]) {
    return `/shops/${direct[0].state_slug}/${direct[0].slug}/`;
  }

  const fuzzy = await sql`
    SELECT c.slug, st.slug as state_slug, similarity(c.name, ${nameOnly}) as sim
    FROM cities c
    JOIN states st ON st.code = c.state_code
    WHERE c.has_dedicated_page = true
      AND (c.name ILIKE ${'%' + nameOnly + '%'} OR c.name % ${nameOnly})
    ORDER BY sim DESC, c.shop_count DESC NULLS LAST
    LIMIT 1
  `;
  if (fuzzy[0]) {
    return `/shops/${fuzzy[0].state_slug}/${fuzzy[0].slug}/`;
  }

  return shopCityFallback(nameOnly, term);
}

async function resolveCityInState(
  cityName: string,
  stateCode: string
): Promise<string | null> {
  const exact = await sql`
    SELECT c.slug, st.slug as state_slug
    FROM cities c
    JOIN states st ON st.code = c.state_code
    WHERE c.has_dedicated_page = true
      AND c.state_code = ${stateCode}
      AND LOWER(TRIM(c.name)) = LOWER(${cityName})
    LIMIT 1
  `;
  if (exact[0]) {
    return `/shops/${exact[0].state_slug}/${exact[0].slug}/`;
  }

  const fuzzy = await sql`
    SELECT c.slug, st.slug as state_slug, similarity(c.name, ${cityName}) as sim
    FROM cities c
    JOIN states st ON st.code = c.state_code
    WHERE c.has_dedicated_page = true
      AND c.state_code = ${stateCode}
      AND (c.name ILIKE ${'%' + cityName + '%'} OR c.name % ${cityName})
    ORDER BY sim DESC, c.shop_count DESC NULLS LAST
    LIMIT 1
  `;
  if (fuzzy[0]) {
    return `/shops/${fuzzy[0].state_slug}/${fuzzy[0].slug}/`;
  }

  return null;
}

async function shopCityFallback(cityName: string, fullTerm: string): Promise<string | null> {
  const rows = await sql`
    SELECT s.slug as shop_slug, c.slug as city_slug, st.slug as state_slug, c.has_dedicated_page
    FROM shops s
    JOIN cities c ON c.name = s.city AND c.state_code = s.state_code
    JOIN states st ON st.code = s.state_code
    WHERE (
        s.city ILIKE ${'%' + cityName + '%'}
        OR s.name % ${fullTerm}
        OR s.city % ${fullTerm}
      )
      AND (s.google_business_status IS NULL OR s.google_business_status != 'CLOSED_PERMANENTLY')
      AND COALESCE(s.listing_status, 'active') = 'active'
    ORDER BY
      CASE WHEN c.has_dedicated_page THEN 0 ELSE 1 END,
      s.google_rating DESC NULLS LAST
    LIMIT 1
  `;
  const r = rows[0] as
    | { shop_slug: string; city_slug: string; state_slug: string; has_dedicated_page: boolean }
    | undefined;
  if (!r) return null;
  if (r.has_dedicated_page) {
    return `/shops/${r.state_slug}/${r.city_slug}/`;
  }
  return `/shops/${r.state_slug}/${r.city_slug}/${r.shop_slug}/`;
}
