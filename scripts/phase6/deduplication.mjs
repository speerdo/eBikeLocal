/**
 * Phase 6 — Workstream 1: Deduplication Engine
 *
 * Promotes scraped data into the canonical `shops` table:
 *   1. Promote enriched google_places_raw records → shops (canonical source)
 *   2. Match staging_shops brand dealer records against shops via coords + name similarity
 *   3. Update staging_shops.matched_shop_id for confirmed matches
 *   4. Insert unmatched staging records (brand-only shops) into shops
 *
 * Usage:
 *   node scripts/phase6/deduplication.mjs              # full run (US-only)
 *   node scripts/phase6/deduplication.mjs --cleanup    # delete non-US rows from google_places_raw first
 *   node scripts/phase6/deduplication.mjs --dry-run    # report only, no DB writes
 *   node scripts/phase6/deduplication.mjs --report     # just print current stats
 */

import { sql, log, normalizeStreetAddressBase, shopSlug } from '../scrapers/utils.mjs';

const DRY_RUN     = process.argv.includes('--dry-run');
const REPORT_ONLY = process.argv.includes('--report');
const CLEANUP     = process.argv.includes('--cleanup'); // delete non-US rows from google_places_raw

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

// Coordinate bounding box for ~100m proximity (rough: 0.001° ≈ 111m at equator)
const COORD_BOX = 0.001;
// Minimum pg_trgm similarity for name match
const NAME_SIM_THRESHOLD = 0.5;
// Minimum coordinate distance (degrees) to require name similarity too
const STRONG_COORD_MATCH = 0.0005; // ~55m
const FALSE_POSITIVE_TERMS = /\b(coffee|cafe|restaurant|bar|hotel|inn|lodge)\b/i;
const BIKE_TERMS = /\b(bike|bikes|bicycle|bicycles|cycle|cycles|ebike|e-bike)\b/i;

// ── Address parser ────────────────────────────────────────────────────────────

/**
 * Parses a Google formatted_address string into components.
 * Input: "123 Main St, Denver, CO 80202, USA"
 * Output: { addressLine1, city, stateCode, zip }
 */
function parseFormattedAddress(addr) {
  if (!addr) return {};
  const parts = addr.split(',').map(p => p.trim());

  // Remove country
  const last = parts[parts.length - 1];
  if (['USA', 'US', 'United States'].includes(last)) parts.pop();

  // State + optional zip (e.g. "CO 80202" or "CO")
  const stateZipStr = parts.pop() || '';
  const stateZipMatch = stateZipStr.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  const stateCode = stateZipMatch ? stateZipMatch[1] : null;
  const zip = stateZipMatch && stateZipMatch[2] ? stateZipMatch[2] : null;

  // City
  const city = parts.pop() || null;

  // Everything else is address_line1
  const addressLine1 = parts.length > 0 ? parts.join(', ') : null;

  return { addressLine1, city, stateCode, zip };
}

// ── Slug with collision avoidance ────────────────────────────────────────────

async function makeUniqueSlug(name, city, stateCode, suffix = '') {
  const base = shopSlug(name, city, stateCode);
  const candidate = suffix ? `${base}-${suffix}` : base;
  const [existing] = await sql`SELECT id FROM shops WHERE slug = ${candidate} LIMIT 1`;
  if (!existing) return candidate;
  // Collision: add a random 4-char suffix from place_id or counter
  const nextSuffix = suffix ? String(Number(suffix) + 1) : '2';
  return makeUniqueSlug(name, city, stateCode, nextSuffix);
}

function shouldFlagPendingReview({ name, rating, reviewCount }) {
  const lowTrustScore = typeof reviewCount === 'number'
    && reviewCount < 20
    && typeof rating === 'number'
    && rating < 3.5;
  const maybeWrongBusinessType = FALSE_POSITIVE_TERMS.test(name || '')
    && !BIKE_TERMS.test(name || '');
  return lowTrustScore || maybeWrongBusinessType;
}

function pendingReviewReason({ name, rating, reviewCount }) {
  const reasons = [];
  if (
    typeof reviewCount === 'number'
    && reviewCount < 20
    && typeof rating === 'number'
    && rating < 3.5
  ) {
    reasons.push('low_rating_and_low_review_count');
  }
  if (FALSE_POSITIVE_TERMS.test(name || '') && !BIKE_TERMS.test(name || '')) {
    reasons.push('name_matches_non_bike_term');
  }
  return reasons.join(',');
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && value != null ? n : null;
}

// ── Promote Google Places → shops ────────────────────────────────────────────

async function promoteGooglePlaces() {
  const rows = await sql`
    SELECT
      place_id, name, formatted_address,
      latitude, longitude,
      phone, website,
      rating, user_rating_count,
      opening_hours, editorial_summary,
      photos, logo_url,
      search_query,
      types,
      raw_data
    FROM google_places_raw
    WHERE details_fetched = true
      -- Pre-filter: only consider US-addressed records at the SQL level
      AND (
        formatted_address LIKE '%, USA'
        OR formatted_address LIKE '%United States'
      )
    ORDER BY fetched_at
  `;

  log('dedup', `Promoting ${rows.length} US-addressed enriched Google Places records → shops`);

  let inserted = 0;
  let skippedExisting = 0;
  let skippedAddressDuplicate = 0;
  let replacedAddressDuplicate = 0;
  let skippedBadAddress = 0;
  let pendingReview = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      // Skip if already in shops
      const [existing] = await sql`
        SELECT id FROM shops WHERE google_place_id = ${row.place_id} LIMIT 1
      `;
      if (existing) { skippedExisting++; continue; }

      const { addressLine1, city, stateCode, zip } = parseFormattedAddress(row.formatted_address);

      // Validate stateCode is a real US state (catches edge cases like "ON", "BC", etc.)
      if (!city || !stateCode || !STATE_NAMES[stateCode]) {
        skippedBadAddress++;
        continue;
      }

      const stateName = STATE_NAMES[stateCode];
      const slug = await makeUniqueSlug(row.name, city, stateCode);
      const normalizedAddress = normalizeStreetAddressBase(addressLine1);
      if (!normalizedAddress) {
        skippedBadAddress++;
        continue;
      }

      const [existingAddressMatch] = await sql`
        SELECT id, google_review_count
        FROM shops
        WHERE normalized_address = ${normalizedAddress}
          AND LOWER(TRIM(city)) = LOWER(TRIM(${city}))
          AND state_code = ${stateCode}
        LIMIT 1
      `;

      if (existingAddressMatch) {
        const existingReviewCount = Number(existingAddressMatch.google_review_count || 0);
        const incomingReviewCount = Number(row.user_rating_count || 0);
        if (incomingReviewCount > existingReviewCount) {
          if (!DRY_RUN) {
            await sql`
              DELETE FROM shops
              WHERE id = ${existingAddressMatch.id}
            `;
          }
          replacedAddressDuplicate++;
        } else {
          skippedAddressDuplicate++;
          continue;
        }
      }

      // Extract photo URLs from photos JSONB
      let featuredImageUrl = null;
      let photoUrls = [];
      if (row.photos) {
        const photosArr = Array.isArray(row.photos) ? row.photos : [];
        const names = photosArr.map(p => p.name).filter(Boolean);
        if (names.length > 0) {
          // Store photo resource names — actual URLs require API call
          featuredImageUrl = null; // Will be resolved at display time
          photoUrls = names.slice(0, 5);
        }
      }

      // Extract googleMapsUri from raw_data if available
      const googleMapsUri = row.raw_data?.googleMapsUri || null;
      const listingStatus = shouldFlagPendingReview({
        name: row.name,
        rating: toNullableNumber(row.rating),
        reviewCount: toNullableNumber(row.user_rating_count),
      }) ? 'pending_review' : 'active';
      const reviewReason = listingStatus === 'pending_review'
        ? pendingReviewReason({
          name: row.name,
          rating: toNullableNumber(row.rating),
          reviewCount: toNullableNumber(row.user_rating_count),
        })
        : null;

      if (!DRY_RUN) {
        await sql`
          INSERT INTO shops (
            google_place_id, name, slug,
            address_line1, city, state, state_code, zip,
            latitude, longitude,
            phone, website,
            google_maps_uri,
            google_rating, google_review_count,
            google_business_status,
            normalized_address,
            listing_status,
            pending_review_reason,
            opening_hours, description,
            description_generated,
            photos, featured_image_url,
            source, created_at, updated_at
          ) VALUES (
            ${row.place_id},
            ${row.name},
            ${slug},
            ${addressLine1},
            ${city},
            ${stateName},
            ${stateCode},
            ${zip},
            ${row.latitude},
            ${row.longitude},
            ${row.phone},
            ${row.website},
            ${googleMapsUri},
            ${row.rating},
            ${row.user_rating_count},
            ${row.raw_data?.businessStatus || null},
            ${normalizedAddress},
            ${listingStatus},
            ${reviewReason},
            ${row.opening_hours},
            ${row.editorial_summary},
            ${!row.editorial_summary},
            ${photoUrls.length > 0 ? sql.array(photoUrls) : null},
            ${featuredImageUrl},
            ${'google_places'},
            NOW(),
            NOW()
          )
        `;
      }
      if (listingStatus === 'pending_review') pendingReview++;
      inserted++;
    } catch (err) {
      log('dedup', `  Error for ${row.place_id}: ${err.message}`);
      errors++;
    }
  }

  log('dedup', `Google Places → shops: inserted=${inserted}, already_exists=${skippedExisting}, replaced_dupe=${replacedAddressDuplicate}, skipped_dupe=${skippedAddressDuplicate}, pending_review=${pendingReview}, bad_address=${skippedBadAddress}, errors=${errors}`);
  return inserted;
}

// ── Match staging_shops → shops ───────────────────────────────────────────────

async function matchStagingToShops() {
  // Load staging records that haven't been matched yet — US only
  const staging = await sql`
    SELECT id, name, address, city, state_code, zip, latitude, longitude,
           phone, website, brand_name, dealer_tier, source, raw_data
    FROM staging_shops
    WHERE status = 'pending'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND city IS NOT NULL
      AND state_code IS NOT NULL
      AND state_code IN (SELECT code FROM states)
    ORDER BY source, city, name
  `;

  log('dedup', `Matching ${staging.length} staging records against shops table...`);

  let matched = 0;
  let unmatched = 0;

  for (const record of staging) {
    // Find candidate shops within bounding box
    const candidates = await sql`
      SELECT
        id,
        name,
        latitude::float AS lat,
        longitude::float AS lng,
        similarity(${record.name}, name) AS name_sim,
        ABS(latitude::float - ${record.latitude}::float) AS dlat,
        ABS(longitude::float - ${record.longitude}::float) AS dlng
      FROM shops
      WHERE ABS(latitude::float - ${record.latitude}::float) < ${COORD_BOX}
        AND ABS(longitude::float - ${record.longitude}::float) < ${COORD_BOX}
        AND state_code = ${record.state_code}
      ORDER BY
        (ABS(latitude::float - ${record.latitude}::float))^2 +
        (ABS(longitude::float - ${record.longitude}::float))^2
      LIMIT 5
    `;

    let bestMatch = null;
    let bestScore = 0;

    for (const c of candidates) {
      const distDeg = Math.sqrt(c.dlat ** 2 + c.dlng ** 2);
      const nameSim = Number(c.name_sim);

      // Strong coord match (<55m) + any name similarity
      if (distDeg < STRONG_COORD_MATCH && nameSim >= 0.3) {
        const score = (1 - distDeg / STRONG_COORD_MATCH) * 0.5 + nameSim * 0.5;
        if (score > bestScore) { bestScore = score; bestMatch = c; }
      }
      // Wider coord match (<110m) + good name similarity
      else if (distDeg < COORD_BOX && nameSim >= NAME_SIM_THRESHOLD) {
        const score = (1 - distDeg / COORD_BOX) * 0.4 + nameSim * 0.6;
        if (score > bestScore) { bestScore = score; bestMatch = c; }
      }
    }

    if (bestMatch) {
      if (!DRY_RUN) {
        await sql`
          UPDATE staging_shops
          SET
            status = 'matched',
            matched_shop_id = ${bestMatch.id},
            processed_at = NOW()
          WHERE id = ${record.id}
        `;
      }
      matched++;
    } else {
      unmatched++;
    }
  }

  log('dedup', `Staging match: matched=${matched}, unmatched=${unmatched}`);
  return { matched, unmatched };
}

// ── Promote unmatched staging → shops ────────────────────────────────────────

async function promoteUnmatchedStaging() {
  const unmatched = await sql`
    SELECT id, name, address, city, state, state_code, zip,
           latitude, longitude, phone, website, brand_name, source, raw_data
    FROM staging_shops
    WHERE status = 'pending'
      AND city IS NOT NULL
      AND state_code IS NOT NULL
      AND name IS NOT NULL
      AND state_code IN (SELECT code FROM states)
    ORDER BY source, state_code, city
  `;

  log('dedup', `Promoting ${unmatched.length} unmatched staging records → shops`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of unmatched) {
    try {
      const stateName = record.state || STATE_NAMES[record.state_code] || record.state_code;
      const normalizedAddress = normalizeStreetAddressBase(record.address);
      if (!normalizedAddress) {
        skipped++;
        continue;
      }

      // Check if a very similar shop exists (name match in same city)
      const [similar] = await sql`
        SELECT id FROM shops
        WHERE state_code = ${record.state_code}
          AND city ILIKE ${record.city}
          AND (
            similarity(name, ${record.name}) >= 0.7
            OR normalized_address = ${normalizedAddress}
          )
        LIMIT 1
      `;
      if (similar) {
        // Link this staging record to the similar shop instead
        if (!DRY_RUN) {
          await sql`
            UPDATE staging_shops
            SET status = 'matched', matched_shop_id = ${similar.id}, processed_at = NOW()
            WHERE id = ${record.id}
          `;
        }
        skipped++;
        continue;
      }

      const slug = await makeUniqueSlug(record.name, record.city, record.state_code);
      const listingStatus = shouldFlagPendingReview({
        name: record.name,
        rating: null,
        reviewCount: null,
      }) ? 'pending_review' : 'active';
      const reviewReason = listingStatus === 'pending_review'
        ? pendingReviewReason({
          name: record.name,
          rating: null,
          reviewCount: null,
        })
        : null;

      if (!DRY_RUN) {
        const [newShop] = await sql`
          INSERT INTO shops (
            name, slug,
            address_line1, city, state, state_code, zip,
            latitude, longitude,
            phone, website,
            normalized_address,
            listing_status,
            pending_review_reason,
            description_generated,
            source, created_at, updated_at
          ) VALUES (
            ${record.name},
            ${slug},
            ${record.address},
            ${record.city},
            ${stateName},
            ${record.state_code},
            ${record.zip},
            ${record.latitude},
            ${record.longitude},
            ${record.phone},
            ${record.website},
            ${normalizedAddress},
            ${listingStatus},
            ${reviewReason},
            ${true},
            ${record.source},
            NOW(),
            NOW()
          )
          RETURNING id
        `;

        await sql`
          UPDATE staging_shops
          SET status = 'matched', matched_shop_id = ${newShop.id}, processed_at = NOW()
          WHERE id = ${record.id}
        `;
      }
      inserted++;
    } catch (err) {
      log('dedup', `  Error for staging ${record.id} (${record.name}): ${err.message}`);
      errors++;
    }
  }

  log('dedup', `Unmatched staging → shops: inserted=${inserted}, name-matched=${skipped}, errors=${errors}`);
  return inserted;
}

// ── Non-US record cleanup ─────────────────────────────────────────────────────

async function cleanupNonUS() {
  const [nonUs] = await sql`
    SELECT COUNT(*) AS n FROM google_places_raw
    WHERE details_fetched = true
      AND formatted_address NOT LIKE '%, USA'
      AND formatted_address NOT LIKE '%United States'
  `;
  log('dedup', `Non-US google_places_raw records: ${nonUs.n}`);

  if (!DRY_RUN) {
    const result = await sql`
      DELETE FROM google_places_raw
      WHERE formatted_address NOT LIKE '%, USA'
        AND formatted_address NOT LIKE '%United States'
    `;
    log('dedup', `Deleted ${result.count} non-US records from google_places_raw`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

async function printReport() {
  const [shopCount] = await sql`SELECT COUNT(*) AS n FROM shops`;
  const [googleCount] = await sql`SELECT COUNT(*) AS n FROM shops WHERE source = 'google_places'`;
  const [stagingCount] = await sql`SELECT COUNT(*) AS n FROM staging_shops`;
  const [matchedCount] = await sql`SELECT COUNT(*) AS n FROM staging_shops WHERE status = 'matched'`;
  const [pendingCount] = await sql`SELECT COUNT(*) AS n FROM staging_shops WHERE status = 'pending'`;
  const [gprCount] = await sql`SELECT COUNT(*) AS n FROM google_places_raw WHERE details_fetched = true`;
  const [nonUsStaging] = await sql`
    SELECT COUNT(*) AS n FROM staging_shops
    WHERE state_code NOT IN (SELECT code FROM states) AND state_code IS NOT NULL
  `;
  const [pendingReviewCount] = await sql`
    SELECT COUNT(*) AS n FROM shops WHERE listing_status = 'pending_review'
  `;
  const bySource = await sql`
    SELECT source, COUNT(*) AS n FROM staging_shops GROUP BY source ORDER BY n DESC
  `;

  log('dedup', '── Deduplication Report ──────────────────────────────');
  log('dedup', `  google_places_raw (enriched US): ${gprCount.n}`);
  log('dedup', `  staging_shops total:             ${stagingCount.n}`);
  log('dedup', `    ↳ non-US state codes:          ${nonUsStaging.n} (excluded)`);
  log('dedup', `  staging_shops matched:           ${matchedCount.n}`);
  log('dedup', `  staging_shops pending:           ${pendingCount.n}`);
  log('dedup', `  shops table total:               ${shopCount.n}`);
  log('dedup', `    ↳ from google_places:          ${googleCount.n}`);
  log('dedup', `    ↳ from brand scrapers only:    ${shopCount.n - googleCount.n}`);
  log('dedup', `    ↳ pending manual review:       ${pendingReviewCount.n}`);
  log('dedup', '  Staging by source:');
  for (const row of bySource) {
    log('dedup', `    ${row.source.padEnd(20)} ${row.n}`);
  }
  log('dedup', '─────────────────────────────────────────────────────');
}

async function flagExistingPendingReviewShops() {
  const result = await sql`
    UPDATE shops
    SET
      listing_status = 'pending_review',
      pending_review_reason = TRIM(BOTH ',' FROM CONCAT_WS(',',
        CASE
          WHEN google_review_count IS NOT NULL
            AND google_review_count < 20
            AND google_rating IS NOT NULL
            AND google_rating < 3.5
          THEN 'low_rating_and_low_review_count'
          ELSE NULL
        END,
        CASE
          WHEN (
            LOWER(name) LIKE '%coffee%'
            OR LOWER(name) LIKE '%cafe%'
            OR LOWER(name) LIKE '%restaurant%'
            OR LOWER(name) LIKE '%bar%'
            OR LOWER(name) LIKE '%hotel%'
            OR LOWER(name) LIKE '%inn%'
            OR LOWER(name) LIKE '%lodge%'
          )
            AND LOWER(name) NOT LIKE '%bike%'
            AND LOWER(name) NOT LIKE '%cycle%'
            AND LOWER(name) NOT LIKE '%ebike%'
            AND LOWER(name) NOT LIKE '%e-bike%'
          THEN 'name_matches_non_bike_term'
          ELSE NULL
        END
      ))
    WHERE (
        (google_review_count IS NOT NULL AND google_review_count < 20 AND google_rating IS NOT NULL AND google_rating < 3.5)
        OR (
          (LOWER(name) LIKE '%coffee%' OR LOWER(name) LIKE '%cafe%' OR LOWER(name) LIKE '%restaurant%' OR LOWER(name) LIKE '%bar%' OR LOWER(name) LIKE '%hotel%' OR LOWER(name) LIKE '%inn%' OR LOWER(name) LIKE '%lodge%')
          AND LOWER(name) NOT LIKE '%bike%'
          AND LOWER(name) NOT LIKE '%cycle%'
          AND LOWER(name) NOT LIKE '%ebike%'
          AND LOWER(name) NOT LIKE '%e-bike%'
        )
      )
      AND COALESCE(listing_status, 'active') = 'active'
  `;
  log('dedup', `Existing shops flagged as pending_review: ${result.count}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (REPORT_ONLY) {
  await printReport();
  await sql.end();
  process.exit(0);
}

if (DRY_RUN) {
  log('dedup', '── DRY RUN MODE — no DB writes ──');
}

log('dedup', 'Phase 6 Workstream 1: Deduplication Engine starting...');

try {
  if (CLEANUP) {
    await cleanupNonUS();
  }
  await promoteGooglePlaces();
  await matchStagingToShops();
  await promoteUnmatchedStaging();
  await flagExistingPendingReviewShops();
  await printReport();
  log('dedup', 'Deduplication complete.');
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
} finally {
  await sql.end();
}
