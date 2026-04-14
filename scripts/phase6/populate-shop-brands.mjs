/**
 * Phase 6 — Workstream 3: Shop-Brand Junction Population
 *
 * Populates the `shop_brands` table by cross-referencing each brand's
 * dealer data (in staging_shops) against the canonical shops records.
 *
 * Requirements:
 *   - Deduplication must have run first (staging_shops.matched_shop_id populated)
 *   - brands table must be seeded
 *
 * Usage:
 *   node scripts/phase6/populate-shop-brands.mjs             # full run
 *   node scripts/phase6/populate-shop-brands.mjs --dry-run   # report only
 *   node scripts/phase6/populate-shop-brands.mjs --report    # stats only
 */

import { sql, log } from '../scrapers/utils.mjs';

const DRY_RUN     = process.argv.includes('--dry-run');
const REPORT_ONLY = process.argv.includes('--report');

// ── Brand name normalizer ──────────────────────────────────────────────────────
// Maps staging_shops.brand_name values → brands.slug

const BRAND_SLUG_MAP = {
  // Aventon
  'aventon': 'aventon',
  // Lectric
  'lectric': 'lectric',
  'lectric ebikes': 'lectric',
  // Rad Power Bikes
  'rad': 'rad-power-bikes',
  'rad power': 'rad-power-bikes',
  'rad power bikes': 'rad-power-bikes',
  // Velotric
  'velotric': 'velotric',
  // Pedego
  'pedego': 'pedego',
  'pedego electric bikes': 'pedego',
  // Trek
  'trek': 'trek',
  // Specialized
  'specialized': 'specialized',
  // Giant
  'giant': 'giant',
  'giant bicycles': 'giant',
  // Cannondale
  'cannondale': 'cannondale',
  // Gazelle
  'gazelle': 'gazelle',
  'royal dutch gazelle': 'gazelle',
  // Tern
  'tern': 'tern',
  'tern bicycles': 'tern',
  // Riese & Müller
  'riese': 'riese-muller',
  'riese & muller': 'riese-muller',
  'riese and muller': 'riese-muller',
  'r&m': 'riese-muller',
  // BULLS
  'bulls': 'bulls',
  'bulls bikes': 'bulls',
  // Priority
  'priority': 'priority-bicycles',
  'priority bicycles': 'priority-bicycles',
};

function normalizeBrandName(name) {
  if (!name) return null;
  return BRAND_SLUG_MAP[name.toLowerCase().trim()] || null;
}

// ── Populate shop_brands ──────────────────────────────────────────────────────

async function populateShopBrands() {
  // Load all brands keyed by slug
  const brandsRows = await sql`SELECT id, slug, name FROM brands WHERE is_active = true`;
  const brandsBySlug = Object.fromEntries(brandsRows.map(b => [b.slug, b]));

  log('shop-brands', `Loaded ${brandsRows.length} brands from DB`);

  // Load all matched staging records that have a brand
  const staging = await sql`
    SELECT
      s.id AS staging_id,
      s.matched_shop_id,
      s.brand_name,
      s.dealer_tier,
      s.source,
      s.scraped_at
    FROM staging_shops s
    WHERE s.status = 'matched'
      AND s.matched_shop_id IS NOT NULL
      AND s.brand_name IS NOT NULL
    ORDER BY s.source, s.brand_name
  `;

  log('shop-brands', `Processing ${staging.length} matched staging records with brand data`);

  let inserted = 0;
  let skipped = 0;
  let unmapped = 0;
  const unmappedBrands = new Set();

  for (const record of staging) {
    const brandSlug = normalizeBrandName(record.brand_name);

    if (!brandSlug) {
      unmapped++;
      unmappedBrands.add(record.brand_name);
      continue;
    }

    const brand = brandsBySlug[brandSlug];
    if (!brand) {
      log('shop-brands', `  Brand slug "${brandSlug}" not found in DB for source brand_name="${record.brand_name}"`);
      unmapped++;
      continue;
    }

    if (!DRY_RUN) {
      try {
        await sql`
          INSERT INTO shop_brands (
            shop_id, brand_id,
            is_authorized_dealer, dealer_tier,
            source, verified_at
          ) VALUES (
            ${record.matched_shop_id},
            ${brand.id},
            ${true},
            ${record.dealer_tier || null},
            ${record.source},
            ${record.scraped_at}
          )
          ON CONFLICT (shop_id, brand_id) DO UPDATE
            SET
              is_authorized_dealer = true,
              dealer_tier = EXCLUDED.dealer_tier,
              source = EXCLUDED.source,
              verified_at = EXCLUDED.verified_at
        `;
        inserted++;
      } catch (err) {
        log('shop-brands', `  DB error for shop=${record.matched_shop_id} brand=${brand.slug}: ${err.message}`);
      }
    } else {
      inserted++;
    }
  }

  if (unmappedBrands.size > 0) {
    log('shop-brands', `  Unmapped brand names (add to BRAND_SLUG_MAP):`);
    for (const name of [...unmappedBrands].sort()) {
      log('shop-brands', `    "${name}"`);
    }
  }

  log('shop-brands', `shop_brands: inserted/updated=${inserted}, skipped=${skipped}, unmapped=${unmapped}`);
}

// ── Report ────────────────────────────────────────────────────────────────────

async function printReport() {
  const [total] = await sql`SELECT COUNT(*) AS n FROM shop_brands`;
  const byBrand = await sql`
    SELECT b.name, COUNT(sb.shop_id) AS dealer_count
    FROM brands b
    LEFT JOIN shop_brands sb ON sb.brand_id = b.id
    GROUP BY b.name
    ORDER BY dealer_count DESC
  `;
  const multiBrand = await sql`
    SELECT shop_id, COUNT(*) AS brand_count
    FROM shop_brands
    GROUP BY shop_id
    HAVING COUNT(*) >= 3
  `;
  const [avgBrands] = await sql`
    SELECT ROUND(AVG(bc), 2) AS avg
    FROM (
      SELECT shop_id, COUNT(*) AS bc FROM shop_brands GROUP BY shop_id
    ) t
  `;

  log('shop-brands', '── Shop-Brand Junction Report ───────────────────────');
  log('shop-brands', `  Total shop_brands rows:   ${total.n}`);
  log('shop-brands', `  Shops with 3+ brands:     ${multiBrand.length}`);
  log('shop-brands', `  Avg brands per shop:      ${avgBrands?.avg || 0}`);
  log('shop-brands', '  Dealers per brand:');
  for (const row of byBrand) {
    log('shop-brands', `    ${row.name.padEnd(25)} ${row.dealer_count}`);
  }
  log('shop-brands', '────────────────────────────────────────────────────');
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (REPORT_ONLY) {
  await printReport();
  await sql.end();
  process.exit(0);
}

if (DRY_RUN) log('shop-brands', '── DRY RUN MODE — no DB writes ──');
log('shop-brands', 'Phase 6 Workstream 3: Shop-Brand Junction Population starting...');

try {
  await populateShopBrands();
  await printReport();
  log('shop-brands', 'Shop-brand junction population complete.');
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
} finally {
  await sql.end();
}
