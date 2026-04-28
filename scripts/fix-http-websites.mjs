/**
 * Bulk-upgrade shop website URLs from http:// to https://.
 *
 * Strategy: for each shop with an http:// website, attempt to fetch the https://
 * version. If it responds with a 2xx or redirect (3xx that eventually lands on https),
 * update the stored URL. Shops whose https:// request fails or times out are left
 * unchanged and logged for manual review.
 *
 * Run:
 *   node scripts/fix-http-websites.mjs            # check + apply updates
 *   node scripts/fix-http-websites.mjs --dry-run  # report only, no writes
 *   node scripts/fix-http-websites.mjs --limit 50 # process only first N shops
 *
 * The script is safe to re-run; already-https URLs are ignored.
 */

import { sql, log } from './scrapers/utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const CONCURRENCY = 10;
const TIMEOUT_MS = 8000;

async function checkHttps(url) {
  const httpsUrl = url.replace(/^http:\/\//, 'https://');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(httpsUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; eBikeLocal-bot/1.0)' },
    });
    clearTimeout(timer);
    // Accept any non-error response; even a 404 means the domain supports https
    return res.status < 500;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

async function runBatch(batch) {
  return Promise.all(
    batch.map(async ({ id, name, website }) => {
      const works = await checkHttps(website);
      return { id, name, website, works };
    })
  );
}

// Fetch all active shops with http:// websites
const query = LIMIT
  ? sql`SELECT id, name, website FROM shops WHERE website LIKE 'http://%' AND listing_status = 'active' LIMIT ${LIMIT}`
  : sql`SELECT id, name, website FROM shops WHERE website LIKE 'http://%' AND listing_status = 'active'`;

const shops = await query;
log('http-fix', `Found ${shops.length} active shops with http:// websites`);

let upgraded = 0;
let failed = 0;
const failedShops = [];

for (let i = 0; i < shops.length; i += CONCURRENCY) {
  const batch = shops.slice(i, i + CONCURRENCY);
  const results = await runBatch(batch);

  for (const { id, name, website, works } of results) {
    if (works) {
      const httpsUrl = website.replace(/^http:\/\//, 'https://');
      if (!DRY_RUN) {
        await sql`UPDATE shops SET website = ${httpsUrl}, updated_at = now() WHERE id = ${id}`;
      }
      log('http-fix', `✓ ${name} → ${httpsUrl}${DRY_RUN ? ' [dry run]' : ''}`);
      upgraded++;
    } else {
      log('http-fix', `✗ ${name} — https not available (${website})`);
      failed++;
      failedShops.push({ name, website });
    }
  }

  if (i % 100 === 0 && i > 0) {
    log('http-fix', `Progress: ${i}/${shops.length} checked, ${upgraded} upgraded so far`);
  }
}

log('http-fix', `\nSummary:`);
log('http-fix', `  Upgraded to https: ${upgraded}`);
log('http-fix', `  Could not upgrade: ${failed}`);
if (failedShops.length > 0) {
  log('http-fix', `\nShops that still have http:// only:`);
  for (const { name, website } of failedShops) {
    log('http-fix', `  - ${name}: ${website}`);
  }
}
if (DRY_RUN) log('http-fix', '\nDRY RUN — no changes written.');

await sql.end();
