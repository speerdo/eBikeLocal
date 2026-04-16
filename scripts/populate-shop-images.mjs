/**
 * Populates shops.featured_image_url from the photos array already stored in each shop.
 *
 * The shops.photos column contains Google Places API v1 photo resource names like:
 *   places/{place_id}/photos/{photo_ref}
 *
 * We call the Places API photo endpoint, follow the redirect once, and store
 * the resolved lh3.googleusercontent.com URL — no API key required at render time.
 *
 * Run: node scripts/populate-shop-images.mjs
 * Options:
 *   --limit=500     Only process N shops (default: all)
 *   --dry-run       Log what would happen without updating DB
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const API_KEY = env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not set in .env');

const sql = postgres(env.DATABASE_URL, { ssl: 'require' });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

// Google Places API quota: 600 GetPhotoMediaRequest/minute by default.
// Sequential with 120ms delay = ~500/min — safely under the limit.
const REQUEST_DELAY_MS = 120;
const PROGRESS_INTERVAL = 50; // log progress every N shops
const MAX_RETRIES = 3;

async function resolvePhotoUrl(photoName, retries = 0) {
  // photoName: "places/{place_id}/photos/{photo_ref}"
  const apiUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${API_KEY}`;

  let res;
  try {
    res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
  } catch {
    return null; // network timeout
  }

  if (res.status === 429) {
    if (retries < MAX_RETRIES) {
      // Exponential backoff: 2s, 4s, 8s
      const wait = 2000 * Math.pow(2, retries);
      await new Promise(r => setTimeout(r, wait));
      return resolvePhotoUrl(photoName, retries + 1);
    }
    return null;
  }

  if (!res.ok) return null;

  // skipHttpRedirect=true returns JSON with photoUri
  const data = await res.json();
  return data?.photoUri ?? null;
}

async function main() {
  console.log(`\n🖼️  Shop Image Population${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('─'.repeat(50));

  // Fetch shops with photos but no featured_image_url
  const query = sql`
    SELECT id, name, photos
    FROM shops
    WHERE photos IS NOT NULL
      AND array_length(photos, 1) > 0
      AND featured_image_url IS NULL
    ORDER BY google_rating DESC NULLS LAST
    ${limit ? sql`LIMIT ${limit}` : sql``}
  `;

  const shops = await query;
  console.log(`Found ${shops.length} shops needing images\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    const photoName = shop.photos[0];

    if (!photoName) {
      failed++;
      continue;
    }

    const photoUrl = await resolvePhotoUrl(photoName);

    if (photoUrl) {
      if (!dryRun) {
        await sql`
          UPDATE shops SET featured_image_url = ${photoUrl}, updated_at = NOW()
          WHERE id = ${shop.id}
        `;
      }
      updated++;
    } else {
      failed++;
    }

    // Progress logging
    if ((i + 1) % PROGRESS_INTERVAL === 0 || i === shops.length - 1) {
      const pct = (((i + 1) / shops.length) * 100).toFixed(1);
      console.log(`  [${i + 1}/${shops.length} ${pct}%] ✓ ${updated} updated, ${failed} failed`);
    }

    // Rate limiting: ~500 req/min sequential
    if (!dryRun) {
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Complete: ${updated} images populated, ${failed} failed`);
  await sql.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
