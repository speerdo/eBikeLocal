/**
 * Populates bikes.hero_image_url by scraping og:image from each bike's affiliate_url.
 * Falls back to a curated list of known CDN image URLs where scraping isn't reliable.
 *
 * Run: node scripts/populate-bike-images.mjs
 * Options:
 *   --dry-run       Log what would happen without updating DB
 *   --slug=xxx      Only update a specific bike slug
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

const sql = postgres(env.DATABASE_URL, { ssl: 'require' });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugArg = args.find(a => a.startsWith('--slug='));
const targetSlug = slugArg?.split('=')[1];

/** Same curated map as `src/data/bike-hero-images.json` (site + DB populate). */
const KNOWN_IMAGES = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'data', 'bike-hero-images.json'), 'utf-8')
);

// ─────────────────────────────────────────────────────────────────────────────
// Scrape og:image from a product page as fallback
// ─────────────────────────────────────────────────────────────────────────────
function absolutizeImageSrc(src, pageUrl) {
  if (!src) return null;
  const t = src.trim().replace(/&amp;/g, '&');
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith('//')) return `https:${t}`;
  if (!pageUrl) return t;
  try {
    return new URL(t, pageUrl).href;
  } catch {
    return t;
  }
}

async function scrapeOgImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; eBikeLocalBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Try og:image first
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) return absolutizeImageSrc(ogMatch[1], url);

    // Fallback: first large product image
    const imgMatch = html.match(/<img[^>]+src=["']([^"']*(?:product|hero|main)[^"']*)["']/i);
    return imgMatch?.[1] ? absolutizeImageSrc(imgMatch[1], url) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚲  Bike Image Population${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('─'.repeat(50));

  const bikes = await sql`
    SELECT b.id, b.slug, b.model_name, b.hero_image_url, b.affiliate_url, br.name as brand
    FROM bikes b
    JOIN brands br ON br.id = b.brand_id
    WHERE b.is_active = true
    ${targetSlug ? sql`AND b.slug = ${targetSlug}` : sql``}
    ORDER BY br.name, b.msrp
  `;

  console.log(`Processing ${bikes.length} bikes...\n`);

  let updated = 0;
  let fromKnown = 0;
  let fromScrape = 0;
  let failed = 0;

  for (const bike of bikes) {
    const label = `${bike.brand} ${bike.model_name}`;

    // Skip if already has image (unless --slug override)
    if (bike.hero_image_url && !targetSlug) {
      console.log(`  ✓ ${label} — already set`);
      continue;
    }

    let imageUrl = null;

    // 1. Try curated list
    if (KNOWN_IMAGES[bike.slug]) {
      imageUrl = KNOWN_IMAGES[bike.slug];
      fromKnown++;
      console.log(`  📦 ${label} — from curated list`);
    }

    // 2. Fall back to scraping the affiliate URL
    if (!imageUrl && bike.affiliate_url) {
      process.stdout.write(`  🔍 ${label} — scraping ${bike.affiliate_url.substring(0, 60)}... `);
      imageUrl = await scrapeOgImage(bike.affiliate_url);
      if (imageUrl) {
        fromScrape++;
        console.log(`✓`);
      } else {
        console.log(`✗ not found`);
        failed++;
      }
    } else if (!imageUrl) {
      console.log(`  ✗ ${label} — no affiliate URL and not in curated list`);
      failed++;
    }

    if (imageUrl && !dryRun) {
      await sql`
        UPDATE bikes SET hero_image_url = ${imageUrl}, updated_at = NOW()
        WHERE id = ${bike.id}
      `;
      updated++;
    } else if (imageUrl && dryRun) {
      console.log(`    → Would set: ${imageUrl.substring(0, 80)}`);
      updated++;
    }

    // Small delay between scrapes
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Results:`);
  console.log(`   ${fromKnown} from curated list`);
  console.log(`   ${fromScrape} scraped from product pages`);
  console.log(`   ${failed} failed / not found`);
  console.log(`   ${updated} total updated`);

  await sql.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
