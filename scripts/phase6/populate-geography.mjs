/**
 * Phase 6 — Workstream 4: Geographic Data Population
 *
 * Populates the `cities` table from shop data and updates shop_count
 * on both `cities` and `states` tables.
 *
 *   1. Derive unique city+state_code combos from the shops table
 *   2. Insert each into cities (slug = "city-name-sc", e.g. "denver-co")
 *   3. Calculate shop_count per city (active shops only)
 *   4. Set has_dedicated_page = true for cities with >= 2 shops
 *   5. Calculate and update shop_count on states table
 *
 * Requirements:
 *   - shops table must be populated (run deduplication + classify first)
 *   - states table must be seeded
 *
 * Usage:
 *   node scripts/phase6/populate-geography.mjs              # full run
 *   node scripts/phase6/populate-geography.mjs --dry-run    # report only
 *   node scripts/phase6/populate-geography.mjs --report     # stats only
 */

import { sql, log, toSlug } from '../scrapers/utils.mjs';

const DRY_RUN     = process.argv.includes('--dry-run');
const REPORT_ONLY = process.argv.includes('--report');

// Minimum shops in a city to generate a dedicated page
const DEDICATED_PAGE_THRESHOLD = 2;

// ── Populate cities ───────────────────────────────────────────────────────────

async function populateCities() {
  // Get unique city+state combos from shops with enough data
  const cityCombos = await sql`
    SELECT
      city,
      state,
      state_code,
      COUNT(*) AS shop_count,
      AVG(latitude)::numeric(10, 7) AS lat,
      AVG(longitude)::numeric(10, 7) AS lng
    FROM shops
    WHERE city IS NOT NULL
      AND state_code IS NOT NULL
      AND city <> ''
      AND LENGTH(state_code) = 2
    GROUP BY city, state, state_code
    ORDER BY shop_count DESC, state_code, city
  `;

  log('geography', `Found ${cityCombos.length} unique city+state combos in shops table`);

  // Verify state codes exist in states table
  const validStates = await sql`SELECT code FROM states`;
  const validStateCodes = new Set(validStates.map(s => s.code));

  let inserted = 0;
  let skipped = 0;
  let invalid = 0;

  for (const combo of cityCombos) {
    if (!validStateCodes.has(combo.state_code)) {
      log('geography', `  Skip "${combo.city}" — unknown state_code "${combo.state_code}"`);
      invalid++;
      continue;
    }

    const slug = toSlug(`${combo.city}-${combo.state_code}`);

    if (!DRY_RUN) {
      try {
        await sql`
          INSERT INTO cities (
            name, slug, state_code,
            latitude, longitude,
            shop_count, has_dedicated_page
          ) VALUES (
            ${combo.city},
            ${slug},
            ${combo.state_code},
            ${combo.lat},
            ${combo.lng},
            ${combo.shop_count},
            ${combo.shop_count >= DEDICATED_PAGE_THRESHOLD}
          )
          ON CONFLICT (slug) DO UPDATE
            SET
              shop_count = EXCLUDED.shop_count,
              has_dedicated_page = EXCLUDED.has_dedicated_page,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude
        `;
        inserted++;
      } catch (err) {
        log('geography', `  DB error for city "${combo.city}, ${combo.state_code}": ${err.message}`);
      }
    } else {
      inserted++;
    }
  }

  log('geography', `Cities: inserted/updated=${inserted}, invalid_state=${invalid}, skipped=${skipped}`);
  return cityCombos.length;
}

// ── Update state shop counts ──────────────────────────────────────────────────

async function updateStateCounts() {
  if (DRY_RUN) {
    const preview = await sql`
      SELECT state_code, COUNT(*) AS n
      FROM shops
      WHERE state_code IS NOT NULL
      GROUP BY state_code
      ORDER BY n DESC
      LIMIT 5
    `;
    log('geography', `  [dry-run] Top states by shop count: ${preview.map(r => `${r.state_code}:${r.n}`).join(', ')} ...`);
    return;
  }

  const [result] = await sql`
    UPDATE states s
    SET shop_count = (
      SELECT COUNT(*)
      FROM shops sh
      WHERE sh.state_code = s.code
    )
    WHERE EXISTS (SELECT 1 FROM shops sh WHERE sh.state_code = s.code)
  `;

  // Also sync cities.shop_count with fresh count from shops table
  await sql`
    UPDATE cities c
    SET shop_count = (
      SELECT COUNT(*)
      FROM shops sh
      WHERE sh.city = c.name
        AND sh.state_code = c.state_code
    )
  `;

  await sql`
    UPDATE cities
    SET has_dedicated_page = (shop_count >= ${DEDICATED_PAGE_THRESHOLD})
  `;

  log('geography', 'State and city shop counts updated.');
}

// ── Report ────────────────────────────────────────────────────────────────────

async function printReport() {
  const [cityTotal] = await sql`SELECT COUNT(*) AS n FROM cities`;
  const [dedPage] = await sql`SELECT COUNT(*) AS n FROM cities WHERE has_dedicated_page = true`;
  const [stateTotal] = await sql`SELECT COUNT(*) AS n FROM states WHERE shop_count > 0`;
  const topStates = await sql`
    SELECT name, shop_count FROM states ORDER BY shop_count DESC LIMIT 10
  `;
  const topCities = await sql`
    SELECT name, state_code, shop_count FROM cities ORDER BY shop_count DESC LIMIT 15
  `;
  const [totalShops] = await sql`SELECT COUNT(*) AS n FROM shops`;

  log('geography', '── Geographic Data Report ───────────────────────────');
  log('geography', `  Total shops:             ${totalShops.n}`);
  log('geography', `  Total cities:            ${cityTotal.n}`);
  log('geography', `  Cities with pages (2+):  ${dedPage.n}`);
  log('geography', `  States with shops:       ${stateTotal.n}/51`);
  log('geography', '  Top 10 states:');
  for (const s of topStates) {
    log('geography', `    ${s.name.padEnd(25)} ${s.shop_count} shops`);
  }
  log('geography', '  Top 15 cities:');
  for (const c of topCities) {
    log('geography', `    ${`${c.name}, ${c.state_code}`.padEnd(30)} ${c.shop_count} shops`);
  }
  log('geography', '────────────────────────────────────────────────────');
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (REPORT_ONLY) {
  await printReport();
  await sql.end();
  process.exit(0);
}

if (DRY_RUN) log('geography', '── DRY RUN MODE — no DB writes ──');
log('geography', 'Phase 6 Workstream 4: Geographic Data Population starting...');

try {
  await populateCities();
  await updateStateCounts();
  await printReport();
  log('geography', 'Geographic population complete.');
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
} finally {
  await sql.end();
}
