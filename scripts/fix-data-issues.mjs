/**
 * Data quality fixes identified in the final-pass audit.
 *
 * Run:
 *   node scripts/fix-data-issues.mjs            # apply all fixes
 *   node scripts/fix-data-issues.mjs --dry-run  # preview SQL, no writes
 *
 * Fixes applied:
 *  1. Denver duplicate shops — mark lower-quality duplicates as listing_status='closed'
 *  2. Basalt Bike & Ski at a Denver address — mark as listing_status='wrong_location'
 *  3. "Ebike" ghost listing in Seattle — 0 reviews, generic name, mark inactive
 *  4. Ridepanda PandaHub Seattle — company shut down 2023, mark as CLOSED_PERMANENTLY
 *  5. Cañon City slug — fix caon-city-co → canon-city-co in cities table
 *  6. Backfill missing city coordinates from shop averages
 *  7. Rad Retail - Denver — remove duplicate of Rad Power Bikes at same 3863 Steele St address
 *  8. Denver Fit Loft & Tribella — flag as pending_review (confidence 0.30, likely fitness studio)
 *  9. Campus Cycles — upgrade website URL from http:// to https://
 */

import { sql, log } from './scrapers/utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

async function run(description, query) {
  if (DRY_RUN) {
    log('fix', `[DRY RUN] ${description}`);
    return;
  }
  try {
    const result = await query();
    log('fix', `${description} — done`);
    return result;
  } catch (err) {
    log('fix', `ERROR: ${description} — ${err.message}`);
  }
}

// ── 1. Denver duplicates ──────────────────────────────────────────────────────

// eBikes USA Service Center (same address as eBikes USA; service-desk-only record,
// fewer reviews — keep the main eBikes USA sales record)
await run(
  'Mark eBikes USA Service Center (1205 W Byers Pl, Denver) as closed',
  () => sql`
    UPDATE shops
    SET listing_status = 'closed'
    WHERE LOWER(name) LIKE '%ebikes usa service center%'
      AND city = 'Denver'
      AND state_code = 'CO'
  `
);

// Epic Cycles (no-rating record) — keep Epic Cycles Denver (209 reviews, 4.7★)
await run(
  'Mark Epic Cycles duplicate (5665 Beeler Street, Denver) as closed',
  () => sql`
    UPDATE shops
    SET listing_status = 'closed'
    WHERE LOWER(name) = 'epic cycles'
      AND city = 'Denver'
      AND state_code = 'CO'
      AND (google_review_count IS NULL OR google_review_count < 50)
  `
);

// Denver Fit Loft & Tribella / Tribella — same address 1060 Bannock St
// Keep whichever has more reviews; mark the other closed
await run(
  'Resolve Tribella / Denver Fit Loft & Tribella duplicate (1060 Bannock St, Denver)',
  () => sql`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          ORDER BY COALESCE(google_review_count, 0) DESC,
                   google_rating DESC NULLS LAST
        ) AS rn
      FROM shops
      WHERE city = 'Denver'
        AND state_code = 'CO'
        AND LOWER(address_line1) LIKE '%1060 bannock%'
        AND COALESCE(listing_status, 'active') != 'closed'
    )
    UPDATE shops
    SET listing_status = 'closed'
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `
);

// ── 2. Basalt Bike & Ski misassigned to Denver ────────────────────────────────

await run(
  'Mark Basalt Bike & Ski at Denver address as wrong_location',
  () => sql`
    UPDATE shops
    SET listing_status = 'wrong_location'
    WHERE LOWER(name) LIKE '%basalt bike%'
      AND city = 'Denver'
      AND state_code = 'CO'
  `
);

// ── 3. "Ebike" ghost listing in Seattle ──────────────────────────────────────

await run(
  'Mark generic "Ebike" listing in Seattle (0 reviews) as inactive',
  () => sql`
    UPDATE shops
    SET listing_status = 'closed'
    WHERE LOWER(TRIM(name)) = 'ebike'
      AND city = 'Seattle'
      AND state_code = 'WA'
      AND (google_review_count IS NULL OR google_review_count = 0)
  `
);

// ── 4. Ridepanda PandaHub Seattle (company closed 2023) ──────────────────────

await run(
  'Mark Ridepanda PandaHub Seattle as permanently closed',
  () => sql`
    UPDATE shops
    SET google_business_status = 'CLOSED_PERMANENTLY'
    WHERE LOWER(name) LIKE '%ridepanda%'
      AND city = 'Seattle'
      AND state_code = 'WA'
  `
);

// ── 5. Fix Cañon City slug ────────────────────────────────────────────────────

await run(
  "Fix Cañon City slug: caon-city-co → canon-city-co",
  () => sql`
    UPDATE cities
    SET slug = 'canon-city-co'
    WHERE slug = 'caon-city-co'
      AND state_code = 'CO'
  `
);

// ── 6. Backfill missing city coordinates from shop averages ──────────────────

await run(
  'Backfill city coordinates where latitude/longitude is NULL or (0, 0)',
  () => sql`
    UPDATE cities c
    SET
      latitude  = sub.avg_lat,
      longitude = sub.avg_lng
    FROM (
      SELECT
        city,
        state_code,
        AVG(latitude)::numeric(10,7)  AS avg_lat,
        AVG(longitude)::numeric(10,7) AS avg_lng
      FROM shops
      WHERE latitude  IS NOT NULL
        AND longitude IS NOT NULL
        AND ABS(latitude)  > 0.001
        AND ABS(longitude) > 0.001
      GROUP BY city, state_code
    ) sub
    WHERE c.name       = sub.city
      AND c.state_code = sub.state_code
      AND (
        c.latitude  IS NULL
        OR c.longitude IS NULL
        OR (ABS(c.latitude) < 0.001 AND ABS(c.longitude) < 0.001)
      )
  `
);

// ── 7. Rad Retail - Denver duplicate ─────────────────────────────────────────
// Same physical address as "Rad Power Bikes - Ebike Sales & Service Center" (google_places source).
// The rad-source entry has lower confidence (0.30 vs 0.45); remove it.

await run(
  'Remove Rad Retail - Denver (duplicate of Rad Power Bikes at 3863 Steele St)',
  () => sql`
    UPDATE shops
    SET listing_status = 'removed',
        is_active = false,
        pending_review_reason = 'Duplicate of Rad Power Bikes - Ebike Sales & Service Center (google_places source) at 3863 Steele St, Denver.'
    WHERE name = 'Rad Retail - Denver'
      AND city = 'Denver'
      AND state_code = 'CO'
      AND source = 'rad'
      AND listing_status = 'active'
  `
);

// ── 8. Denver Fit Loft & Tribella — pending review ────────────────────────────
// Confidence score 0.30; name suggests fitness/yoga studio, not an eBike dealer.
// Website points to Trek store 629477 — requires manual verification.

await run(
  'Flag Denver Fit Loft & Tribella as pending_review (likely not an eBike shop)',
  () => sql`
    UPDATE shops
    SET listing_status = 'pending_review',
        pending_review_reason = 'Name suggests a fitness/yoga studio rather than an eBike dealer. Confidence score 0.30. Website links to Trek store 629477 — verify manually.'
    WHERE name = 'Denver Fit Loft & Tribella'
      AND city = 'Denver'
      AND state_code = 'CO'
      AND listing_status = 'active'
  `
);

// ── 9. Campus Cycles — upgrade HTTP to HTTPS ──────────────────────────────────

await run(
  'Upgrade Campus Cycles website from http:// to https://',
  () => sql`
    UPDATE shops
    SET website = REPLACE(website, 'http://', 'https://')
    WHERE name = 'Campus Cycles'
      AND city = 'Denver'
      AND state_code = 'CO'
      AND website LIKE 'http://%'
  `
);

// ── Report ────────────────────────────────────────────────────────────────────

const [closedCount] = await sql`
  SELECT COUNT(*) AS n FROM shops WHERE listing_status IN ('closed', 'wrong_location')
`;
const [nullCoordCities] = await sql`
  SELECT COUNT(*) AS n FROM cities
  WHERE (latitude IS NULL OR longitude IS NULL)
    AND has_dedicated_page = true
`;

log('fix', `Total shops with listing_status closed/wrong_location: ${closedCount.n}`);
log('fix', `Cities with dedicated pages still missing coordinates: ${nullCoordCities.n}`);
log('fix', DRY_RUN ? 'DRY RUN complete — no changes written.' : 'All fixes applied.');

await sql.end();
