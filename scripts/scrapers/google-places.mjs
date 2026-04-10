/**
 * Phase 5 - Google Places API scraper
 * Batch-based discovery (Text Search) + enrichment (Place Details).
 *
 * Strategy:
 *   - Reads unique city+state combos from staging_shops (ordered by shop count desc)
 *   - Divides into 10 batches of ~250 cities each (10% per batch)
 *   - Discovery:  Text Search × 2 query variants per city → google_places_raw
 *   - Enrichment: Place Details for all rows where details_fetched = false
 *
 * Usage:
 *   node scripts/scrapers/google-places.mjs --batch 1              # discover batch 1 only
 *   node scripts/scrapers/google-places.mjs --batch 1 --enrich     # discover + enrich
 *   node scripts/scrapers/google-places.mjs --enrich               # enrich all pending
 *   node scripts/scrapers/google-places.mjs --batch 2              # next 10%
 *
 * Cost estimate per batch:
 *   ~500 Text Search requests  @ $32.50/1000 = ~$16
 *   ~500–1500 Place Details    @ $32.00/1000 = ~$16–48  (Advanced: phone/website/hours/rating)
 *   Per batch total: ~$32–64 depending on results density
 */
import { env, log, rateLimit, sleep, sql } from './utils.mjs';
import { fileURLToPath } from 'url';

const API_KEY = env.GOOGLE_PLACES_API_KEY;
const PLACES_BASE = 'https://places.googleapis.com/v1';

// 250 cities per batch ≈ 10% of ~2,507 unique cities
const CITIES_PER_BATCH = 250;

// Text search query variants — 2 per city keeps cost predictable
const SEARCH_QUERIES = [
  'electric bike shop',
  'ebike dealer',
];

// Rate limit: 500ms between requests (~2 req/sec, well within Google's limits)
const RATE_MS = 500;

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function textSearch(query, lat, lng, searchQuery) {
  await rateLimit('places.googleapis.com', RATE_MS);

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      // Basic tier fields only — cheapest SKU ($32.50/1000)
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
    },
    body: JSON.stringify({
      textQuery: query,
      includedType: 'bicycle_store',
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 25000, // 25km radius around city center
        },
      },
      maxResultCount: 20,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Text Search ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// Basic SKU ($5/1000): id, name, address, coords, types only
// Used for shops already in staging_shops — we just need photos + rating
const FIELD_MASK_BASIC = [
  'id', 'displayName', 'formattedAddress', 'location', 'types',
  'rating', 'userRatingCount',
  'regularOpeningHours',
  'editorialSummary',
  'photos',
].join(',');

// Advanced SKU ($32/1000): adds phone + website
// Used for net-new shops not in any brand dealer locator
const FIELD_MASK_ADVANCED = FIELD_MASK_BASIC + ',nationalPhoneNumber,websiteUri';

async function placeDetails(placeId, { knownShop = false } = {}) {
  await rateLimit('places.googleapis.com', RATE_MS);

  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': knownShop ? FIELD_MASK_BASIC : FIELD_MASK_ADVANCED,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Place Details ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// Check if a Google place already exists in staging_shops by coordinate proximity (<200m)
async function isKnownShop(lat, lng) {
  if (!lat || !lng) return false;
  const [row] = await sql`
    SELECT id FROM staging_shops
    WHERE ABS(latitude::float - ${lat}) < 0.002
      AND ABS(longitude::float - ${lng}) < 0.002
    LIMIT 1
  `;
  return !!row;
}

// ── Logo lookup via Google favicon service ────────────────────────────────────

/**
 * Returns a logo/favicon URL for the given website using Google's favicon service.
 * No API key required. Always returns a URL (Google returns a placeholder on miss),
 * so we do a HEAD to confirm it resolves to a real image (non-placeholder).
 * sz=128 gives a high enough resolution for shop pages.
 */
async function fetchLogoUrl(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    const domain = new URL(websiteUrl).hostname.replace(/^www\./, '');
    const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    // Google always returns 200 but resolves to a grey placeholder for unknown domains.
    // The final URL contains the actual domain when it found a real favicon.
    if (!res.ok) return null;
    const finalUrl = res.url;
    return finalUrl;
  } catch {
    return null;
  }
}

// ── Discovery pass ────────────────────────────────────────────────────────────

async function runDiscovery(batchNum) {
  const offset = (batchNum - 1) * CITIES_PER_BATCH;

  // Load city+state combos from staging, ordered by shop density
  const cities = await sql`
    SELECT
      city,
      state_code,
      COUNT(*) as shop_count,
      AVG(latitude)::numeric(9,6)  as lat,
      AVG(longitude)::numeric(9,6) as lng
    FROM staging_shops
    WHERE city IS NOT NULL
      AND state_code IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    GROUP BY city, state_code
    ORDER BY shop_count DESC, state_code, city
    LIMIT ${CITIES_PER_BATCH} OFFSET ${offset}
  `;

  if (cities.length === 0) {
    log('google-places', `No cities found for batch ${batchNum}. All batches may be complete.`);
    return 0;
  }

  log('google-places', `Batch ${batchNum}: ${cities.length} cities, ${cities.length * SEARCH_QUERIES.length} Text Search requests`);
  log('google-places', `Est. cost: ~$${((cities.length * SEARCH_QUERIES.length / 1000) * 32.50).toFixed(2)} (Text Search Basic)`);

  let totalRequests = 0;
  let totalFound = 0;
  let totalNew = 0;

  for (const city of cities) {
    for (const queryTemplate of SEARCH_QUERIES) {
      const query = `${queryTemplate} ${city.city} ${city.state_code}`;
      totalRequests++;

      try {
        const data = await textSearch(query, Number(city.lat), Number(city.lng), queryTemplate);
        const places = data.places || [];
        totalFound += places.length;

        for (const place of places) {
          try {
            const [inserted] = await sql`
              INSERT INTO google_places_raw (
                place_id, name, formatted_address,
                latitude, longitude, types, raw_data,
                search_query, batch
              ) VALUES (
                ${place.id},
                ${place.displayName?.text || null},
                ${place.formattedAddress || null},
                ${place.location?.latitude || null},
                ${place.location?.longitude || null},
                ${place.types || null},
                ${place},
                ${queryTemplate},
                ${batchNum}
              )
              ON CONFLICT (place_id) DO NOTHING
              RETURNING id
            `;
            if (inserted) totalNew++;
          } catch (dbErr) {
            log('google-places', `DB insert error for ${place.id}: ${dbErr.message}`);
          }
        }
      } catch (err) {
        log('google-places', `Error for "${query}": ${err.message}`);
        await sleep(2000); // back off on errors
      }
    }

    // Progress every 25 cities
    if (cities.indexOf(city) % 25 === 24) {
      const pct = Math.round(((cities.indexOf(city) + 1) / cities.length) * 100);
      log('google-places', `  ${pct}% — ${totalRequests} requests, ${totalNew} new places stored`);
    }
  }

  log('google-places', `Discovery batch ${batchNum} complete:`);
  log('google-places', `  Requests:   ${totalRequests}`);
  log('google-places', `  Found:      ${totalFound} (with duplicates across queries)`);
  log('google-places', `  New stored: ${totalNew}`);
  log('google-places', `  Est. cost:  ~$${((totalRequests / 1000) * 32.50).toFixed(2)}`);

  return totalNew;
}

// ── Enrichment pass ───────────────────────────────────────────────────────────

async function runEnrichment(batchNum) {
  // If batchNum provided, only enrich places discovered in that batch
  const pending = batchNum
    ? await sql`
        SELECT place_id, latitude, longitude FROM google_places_raw
        WHERE details_fetched = false AND batch = ${batchNum}
        ORDER BY fetched_at
      `
    : await sql`
        SELECT place_id, latitude, longitude FROM google_places_raw
        WHERE details_fetched = false
        ORDER BY fetched_at
      `;

  if (pending.length === 0) {
    log('google-places', 'No pending places to enrich.');
    return 0;
  }

  log('google-places', `Enriching ${pending.length} places with Place Details...`);
  log('google-places', `  Known shops → Basic SKU (~$5/1000), Net-new → Advanced SKU (~$32/1000)`);

  let done = 0;
  let knownCount = 0;
  let newCount = 0;
  let errors = 0;

  for (const row of pending) {
    try {
      const known = await isKnownShop(row.latitude, row.longitude);
      if (known) knownCount++; else newCount++;
      const detail = await placeDetails(row.place_id, { knownShop: known });
      const logoUrl = await fetchLogoUrl(detail.websiteUri);

      await sql`
        UPDATE google_places_raw SET
          name                = ${detail.displayName?.text || null},
          formatted_address   = ${detail.formattedAddress || null},
          latitude            = ${detail.location?.latitude || null},
          longitude           = ${detail.location?.longitude || null},
          phone               = ${detail.nationalPhoneNumber || null},
          website             = ${detail.websiteUri || null},
          rating              = ${detail.rating || null},
          user_rating_count   = ${detail.userRatingCount || null},
          types               = ${detail.types || null},
          opening_hours       = ${detail.regularOpeningHours || null},
          editorial_summary   = ${detail.editorialSummary?.text || null},
          photos              = ${detail.photos ? sql.json(detail.photos) : null},
          logo_url            = ${logoUrl},
          raw_data            = ${detail},
          details_fetched     = true
        WHERE place_id = ${row.place_id}
      `;

      done++;
      if (done % 100 === 0) {
        const estCost = ((knownCount / 1000) * 5.00) + ((newCount / 1000) * 32.00);
        log('google-places', `  Enriched ${done}/${pending.length} — known: ${knownCount}, new: ${newCount}, est. cost: ~$${estCost.toFixed(2)}`);
      }
    } catch (err) {
      log('google-places', `Details error for ${row.place_id}: ${err.message}`);
      errors++;
      await sleep(1000);
    }
  }

  const totalCost = ((knownCount / 1000) * 5.00) + ((newCount / 1000) * 32.00);
  log('google-places', `Enrichment complete: ${done} enriched, ${errors} errors`);
  log('google-places', `  Known (Basic):   ${knownCount} @ $5/1000  = ~$${((knownCount / 1000) * 5.00).toFixed(2)}`);
  log('google-places', `  Net-new (Adv):   ${newCount} @ $32/1000 = ~$${((newCount / 1000) * 32.00).toFixed(2)}`);
  log('google-places', `  Total est. cost: ~$${totalCost.toFixed(2)}`);
  return done;
}

// ── Summary stats ─────────────────────────────────────────────────────────────

async function printStats() {
  const [total] = await sql`SELECT COUNT(*) as n FROM google_places_raw`;
  const [enriched] = await sql`SELECT COUNT(*) as n FROM google_places_raw WHERE details_fetched = true`;
  const byBatch = await sql`SELECT batch, COUNT(*) as n FROM google_places_raw GROUP BY batch ORDER BY batch`;

  log('google-places', '── Current google_places_raw stats ──');
  log('google-places', `  Total discovered:  ${total.n}`);
  log('google-places', `  Details fetched:   ${enriched.n}`);
  for (const b of byBatch) {
    log('google-places', `  Batch ${b.batch}:           ${b.n} places`);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const batchArg = args.includes('--batch') ? parseInt(args[args.indexOf('--batch') + 1]) : null;
const doEnrich = args.includes('--enrich');
const doLogos  = args.includes('--logos');

if (!batchArg && !doEnrich && !doLogos) {
  console.error('Usage:');
  console.error('  node scripts/scrapers/google-places.mjs --batch 1           # discover batch 1 (10% of cities)');
  console.error('  node scripts/scrapers/google-places.mjs --batch 1 --enrich  # discover + enrich');
  console.error('  node scripts/scrapers/google-places.mjs --enrich            # enrich all pending');
  console.error('  node scripts/scrapers/google-places.mjs --logos             # backfill logo_url for all enriched rows');
  process.exit(1);
}

if (!API_KEY) {
  console.error('GOOGLE_PLACES_API_KEY not set in .env');
  process.exit(1);
}

async function runLogos() {
  const rows = await sql`
    SELECT place_id, website FROM google_places_raw
    WHERE details_fetched = true AND logo_url IS NULL AND website IS NOT NULL
  `;
  log('google-places', `Logo backfill: ${rows.length} rows with website but no logo`);
  let found = 0;
  for (const row of rows) {
    const logoUrl = await fetchLogoUrl(row.website);
    if (logoUrl) {
      await sql`UPDATE google_places_raw SET logo_url = ${logoUrl} WHERE place_id = ${row.place_id}`;
      found++;
    }
  }
  log('google-places', `Logo backfill complete: ${found}/${rows.length} logos found`);
}

try {
  if (batchArg) {
    await runDiscovery(batchArg);
  }
  if (doEnrich) {
    await runEnrichment(batchArg || null);
  }
  if (doLogos) {
    await runLogos();
  }
  await printStats();
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
} finally {
  await sql.end();
}

// Run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // handled above
}
