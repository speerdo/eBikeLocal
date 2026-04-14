/**
 * Phase 6 — Workstream 2: eBike Classification Pipeline
 *
 * Computes ebike_confidence_score for every shop in the `shops` table:
 *
 *   +0.30  Found via eBike-specific Google Places query (electric bike shop / ebike dealer)
 *   +0.30  Appears in at least one brand dealer locator (staging_shops match)
 *   +0.15  Shop name contains eBike keywords
 *   +0.10  Google editorial_summary mentions eBike terms or brands
 *   +0.20  Website content mentions eBike terms (requires --website-check flag)
 *
 *   Scores cap at 1.0.
 *   is_ebike_specialist = true for score >= 0.8
 *   Shops with score < 0.5 are flagged (not deleted — use --apply-filter to mark inactive)
 *
 * Usage:
 *   node scripts/phase6/classify-ebike.mjs                  # score all shops
 *   node scripts/phase6/classify-ebike.mjs --website-check  # include website fetching (+0.20)
 *   node scripts/phase6/classify-ebike.mjs --apply-filter   # mark shops < 0.5 as inactive
 *   node scripts/phase6/classify-ebike.mjs --dry-run        # compute & log, no writes
 */

import { sql, log, rateLimit, sleep } from '../scrapers/utils.mjs';

const WEBSITE_CHECK = process.argv.includes('--website-check');
const APPLY_FILTER  = process.argv.includes('--apply-filter');
const DRY_RUN       = process.argv.includes('--dry-run');

// ── Keyword lists ─────────────────────────────────────────────────────────────

const EBIKE_NAME_KEYWORDS = [
  'electric bike', 'e-bike', 'ebike', 'e bike', 'electric bicycle',
  'electric cycle', 'e-cycle',
];

const EBIKE_BRAND_KEYWORDS = [
  'aventon', 'lectric', 'rad power', 'radpower', 'velotric', 'pedego',
  'trek', 'specialized', 'giant', 'cannondale', 'gazelle', 'tern',
  'riese', 'bulls bikes', 'priority bicycles', 'super73', 'rad rover',
  'ride1up', 'himiway', 'heybike', 'engwe', 'blix', 'evelo', 'quietkat',
  'tenways', 'buzz bike', 'electric bike company',
];

const EBIKE_CONTENT_KEYWORDS = [
  'electric bike', 'e-bike', 'ebike', 'e bike', 'electric bicycle',
  'pedal assist', 'throttle assist', 'battery pack', 'motor watt',
  'class 1', 'class 2', 'class 3', 'ebike dealer', 'electric cycle',
  ...EBIKE_BRAND_KEYWORDS,
];

function containsKeywords(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

// ── Website content check ─────────────────────────────────────────────────────

async function checkWebsite(url) {
  if (!url) return false;
  try {
    await rateLimit(new URL(url).hostname, 500);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return false;
    // Read first 50KB only — enough to capture homepage content
    const reader = res.body.getReader();
    let text = '';
    while (text.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    reader.cancel();
    return containsKeywords(text, EBIKE_CONTENT_KEYWORDS);
  } catch {
    return false;
  }
}

// ── Score computation ─────────────────────────────────────────────────────────

async function scoreShop(shop) {
  let score = 0;
  const signals = [];

  // Signal 1: found via eBike-specific Google query (+0.30)
  if (shop.google_place_id) {
    const [gpr] = await sql`
      SELECT place_id FROM google_places_raw
      WHERE place_id = ${shop.google_place_id}
        AND search_query IN ('electric bike shop', 'ebike dealer')
      LIMIT 1
    `;
    if (gpr) {
      score += 0.30;
      signals.push('google-query:+0.30');
    }
  }

  // Signal 2: appears in at least one brand dealer locator (+0.30)
  const [stagingMatch] = await sql`
    SELECT id FROM staging_shops
    WHERE matched_shop_id = ${shop.id}
      AND brand_name IS NOT NULL
    LIMIT 1
  `;
  if (stagingMatch) {
    score += 0.30;
    signals.push('brand-dealer:+0.30');
  }

  // Signal 3: shop name contains eBike keywords (+0.15)
  if (containsKeywords(shop.name, EBIKE_NAME_KEYWORDS)) {
    score += 0.15;
    signals.push('name-keyword:+0.15');
  }

  // Signal 4: editorial_summary mentions eBike terms (+0.10)
  if (containsKeywords(shop.description, [...EBIKE_NAME_KEYWORDS, ...EBIKE_BRAND_KEYWORDS])) {
    score += 0.10;
    signals.push('summary-keyword:+0.10');
  }

  // Signal 5: website content (optional, requires --website-check)
  if (WEBSITE_CHECK && shop.website) {
    const found = await checkWebsite(shop.website);
    if (found) {
      score += 0.20;
      signals.push('website-keyword:+0.20');
    }
  }

  return { score: Math.min(score, 1.0), signals };
}

// ── Ensure is_active column exists ───────────────────────────────────────────

async function ensureIsActiveColumn() {
  await sql`
    ALTER TABLE shops
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
  `;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function classifyAll() {
  await ensureIsActiveColumn();

  const shops = await sql`
    SELECT id, name, google_place_id, website, description
    FROM shops
    ORDER BY state_code, city, name
  `;

  log('classify', `Scoring ${shops.length} shops...`);

  let done = 0;
  let specialist = 0;
  let belowThreshold = 0;
  const scoresBucket = { '0.0': 0, '0.1': 0, '0.2': 0, '0.3': 0, '0.4': 0, '0.5': 0, '0.6': 0, '0.7': 0, '0.8': 0, '0.9': 0, '1.0': 0 };

  for (const shop of shops) {
    const { score, signals } = await scoreShop(shop);
    const bucket = String(Math.floor(score * 10) / 10);
    if (scoresBucket[bucket] !== undefined) scoresBucket[bucket]++;

    const isSpecialist = score >= 0.8;
    if (isSpecialist) specialist++;
    if (score < 0.5) belowThreshold++;

    if (!DRY_RUN) {
      await sql`
        UPDATE shops
        SET
          ebike_confidence_score = ${score},
          is_ebike_specialist = ${isSpecialist},
          updated_at = NOW()
        WHERE id = ${shop.id}
      `;
    }

    done++;
    if (done % 500 === 0) {
      log('classify', `  Progress: ${done}/${shops.length} scored`);
    }
  }

  // Apply filter: mark shops below 0.5 as inactive
  if (APPLY_FILTER && !DRY_RUN) {
    const [result] = await sql`
      UPDATE shops
      SET is_active = false, updated_at = NOW()
      WHERE ebike_confidence_score < 0.5
        AND is_active IS DISTINCT FROM false
      RETURNING COUNT(*) AS n
    `;
    log('classify', `Filter applied: ${result?.n || 0} shops marked inactive (score < 0.5)`);
  }

  log('classify', '── eBike Classification Report ──────────────────────');
  log('classify', `  Total shops scored:    ${shops.length}`);
  log('classify', `  Specialists (>= 0.8):  ${specialist}`);
  log('classify', `  Below threshold(<0.5): ${belowThreshold}`);
  log('classify', '  Score distribution:');
  for (const [bucket, count] of Object.entries(scoresBucket)) {
    const bar = '█'.repeat(Math.round(count / shops.length * 40));
    log('classify', `    ${bucket}: ${String(count).padStart(5)} ${bar}`);
  }
  log('classify', '────────────────────────────────────────────────────');
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (DRY_RUN) log('classify', '── DRY RUN MODE — no DB writes ──');
log('classify', 'Phase 6 Workstream 2: eBike Classification Pipeline starting...');

try {
  await classifyAll();
  log('classify', 'Classification complete.');
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
} finally {
  await sql.end();
}
