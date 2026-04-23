/**
 * Manual duplicate cleanup utility.
 *
 * Usage:
 *   node scripts/manual-dedupe-priority.mjs --state CO --city Denver --dry-run
 *   node scripts/manual-dedupe-priority.mjs --state CO --city Denver --apply
 *   node scripts/manual-dedupe-priority.mjs --apply   (all cities/states)
 *
 * Keeps the strongest listing active per normalized address key:
 *   1) higher google_review_count
 *   2) higher google_rating
 *   3) newer updated_at
 * Demotes the rest to listing_status='pending_review'.
 */

import { sql, log } from './scrapers/utils.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || !args.includes('--apply');
const stateIdx = args.indexOf('--state');
const cityIdx = args.indexOf('--city');
const stateCode = stateIdx >= 0 ? args[stateIdx + 1]?.toUpperCase() : null;
const cityName = cityIdx >= 0 ? args[cityIdx + 1] : null;

function whereFilterSql() {
  const clauses = [`COALESCE(listing_status, 'active') = 'active'`];
  if (stateCode) clauses.push(`state_code = '${stateCode.replace(/'/g, "''")}'`);
  if (cityName) clauses.push(`city ILIKE '${cityName.replace(/'/g, "''")}'`);
  return clauses.join(' AND ');
}

const baseWhere = whereFilterSql();

const previewSql = `
WITH prepared AS (
  SELECT
    id,
    name,
    city,
    state_code,
    address_line1,
    google_rating,
    google_review_count,
    updated_at,
    LOWER(TRIM(REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(COALESCE(address_line1, ''), '\\\\m(street)\\\\M', 'st', 'gi'),
                  '\\\\m(avenue)\\\\M', 'ave', 'gi'
                ),
                '\\\\m(road)\\\\M', 'rd', 'gi'
              ),
              '\\\\m(place)\\\\M', 'pl', 'gi'
            ),
            '\\\\m(unit|suite|ste|apt)\\\\.?\\\\s*[a-z0-9-]+', '', 'gi'
          ),
          '#\\\\s*[a-z0-9-]+', '', 'gi'
        ),
        '\\\\s+', ' ', 'g'
      ),
      ',\\\\s*', '', 'g'
    ))) AS dedup_key
  FROM shops
  WHERE ${baseWhere}
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY city, state_code, dedup_key
      ORDER BY google_review_count DESC NULLS LAST, google_rating DESC NULLS LAST, updated_at DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY city, state_code, dedup_key) AS grp_count
  FROM prepared
)
SELECT city, state_code, dedup_key, grp_count,
       STRING_AGG(name || ' (reviews=' || COALESCE(google_review_count::text, '0') || ', rn=' || rn::text || ')', ' || ' ORDER BY rn) AS members
FROM ranked
WHERE grp_count > 1
GROUP BY city, state_code, dedup_key, grp_count
ORDER BY grp_count DESC, city, dedup_key
LIMIT 200;
`;

const applySql = `
WITH prepared AS (
  SELECT
    id,
    city,
    state_code,
    LOWER(TRIM(REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(COALESCE(address_line1, ''), '\\\\m(street)\\\\M', 'st', 'gi'),
                  '\\\\m(avenue)\\\\M', 'ave', 'gi'
                ),
                '\\\\m(road)\\\\M', 'rd', 'gi'
              ),
              '\\\\m(place)\\\\M', 'pl', 'gi'
            ),
            '\\\\m(unit|suite|ste|apt)\\\\.?\\\\s*[a-z0-9-]+', '', 'gi'
          ),
          '#\\\\s*[a-z0-9-]+', '', 'gi'
        ),
        '\\\\s+', ' ', 'g'
      ),
      ',\\\\s*', '', 'g'
    ))) AS dedup_key,
    google_rating,
    google_review_count,
    updated_at
  FROM shops
  WHERE ${baseWhere}
),
ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY city, state_code, dedup_key
      ORDER BY google_review_count DESC NULLS LAST, google_rating DESC NULLS LAST, updated_at DESC
    ) AS rn
  FROM prepared
)
UPDATE shops s
SET
  listing_status = 'pending_review',
  pending_review_reason = CASE
    WHEN COALESCE(s.pending_review_reason, '') = '' THEN 'duplicate_address_lower_quality'
    WHEN s.pending_review_reason LIKE '%duplicate_address_lower_quality%' THEN s.pending_review_reason
    ELSE s.pending_review_reason || ',duplicate_address_lower_quality'
  END,
  updated_at = NOW()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1
  AND COALESCE(s.listing_status, 'active') = 'active'
RETURNING s.id, s.name, s.city, s.state_code, s.address_line1, s.google_review_count, s.google_rating;
`;

try {
  const preview = await sql.unsafe(previewSql);
  log('manual-dedupe', `Duplicate groups found: ${preview.length}`);
  for (const row of preview.slice(0, 20)) {
    log('manual-dedupe', `${row.city}, ${row.state_code} :: ${row.dedup_key} => ${row.members}`);
  }

  if (DRY_RUN) {
    log('manual-dedupe', 'Dry run only. Re-run with --apply to demote lower-quality duplicates.');
  } else {
    const updated = await sql.unsafe(applySql);
    log('manual-dedupe', `Demoted duplicate records: ${updated.length}`);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
