/**
 * Uses Playwright to extract product images from JS-rendered brand websites.
 * Targets the 8 bikes whose images are inaccessible via plain HTTP.
 *
 * Run: node scripts/scrape-missing-bike-images.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
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
const OUT_DIR = join(__dirname, '..', 'public', 'images', 'bikes');

const TARGETS = [
  {
    slug: 'trek-verve-2',
    url: 'https://www.trekbikes.com/us/en_US/bikes/electric-bikes/electric-fitness-bikes/verve/verve-2-equipped-lowstep/p/37100/',
    waitFor: '.product-detail__image img, [data-testid="product-image"] img, .hero-image img',
  },
  {
    slug: 'trek-allant-7',
    url: 'https://www.trekbikes.com/us/en_US/bikes/electric-bikes/electric-hybrid-bikes/allant/allant-7/p/37086/',
    waitFor: '.product-detail__image img, [data-testid="product-image"] img',
  },
  {
    slug: 'trek-powerfly-5',
    url: 'https://www.trekbikes.com/us/en_US/bikes/electric-bikes/electric-mountain-bikes/powerfly/powerfly-5/p/37126/',
    waitFor: '.product-detail__image img, [data-testid="product-image"] img',
  },
  {
    slug: 'giant-talon-e-2',
    url: 'https://www.giant-bicycles.com/us/talon-e-plus-2',
    waitFor: '.product-img img, .product-hero img, .bike-image img, [class*="productImage"] img',
  },
  {
    slug: 'giant-explore-e-1',
    url: 'https://www.giant-bicycles.com/us/explore-e-plus-1',
    waitFor: '.product-img img, .product-hero img, .bike-image img, [class*="productImage"] img',
  },
  {
    slug: 'giant-fastroad-e-1-pro',
    url: 'https://www.giant-bicycles.com/us/fastroad-e-plus-1-pro',
    waitFor: '.product-img img, .product-hero img, .bike-image img',
  },
  {
    slug: 'cannondale-adventure-neo-3',
    url: 'https://www.cannondale.com/en-us/bikes/urban/adventure-neo/adventure-neo-3',
    waitFor: '.product-hero img, .product-image img, [class*="ProductImage"] img, .pdp-image img',
  },
  {
    slug: 'tern-vektron-s10',
    url: 'https://www.ternbicycles.com/us/bikes/vektron-s10',
    waitFor: '.bike-hero img, .product-image img, [class*="bike"] img',
  },
];

async function extractBestProductImage(page, slug) {
  // Strategy 1: og:image meta tag (most reliable if set)
  const ogImage = await page.evaluate(() => {
    const m = document.querySelector('meta[property="og:image"]');
    return m?.getAttribute('content') || null;
  });
  if (ogImage && !ogImage.includes('default') && !ogImage.includes('logo') && !ogImage.includes('icon')) {
    return ogImage;
  }

  // Strategy 2: largest visible img on page that isn't a logo/icon
  const bestImg = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img[src]'));
    const candidates = imgs
      .filter(img => {
        const src = img.src || img.currentSrc || '';
        if (!src || src.startsWith('data:')) return false;
        if (/(logo|icon|favicon|banner|avatar|pixel|sprite|placeholder)/i.test(src)) return false;
        const rect = img.getBoundingClientRect();
        return rect.width >= 200 && rect.height >= 200;
      })
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
      });
    return candidates[0]?.currentSrc || candidates[0]?.src || null;
  });
  if (bestImg) return bestImg;

  // Strategy 3: srcset — extract first high-res image
  const srcsetImg = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img[srcset]'));
    for (const img of imgs) {
      const srcset = img.srcset || '';
      const parts = srcset.split(',').map(p => p.trim().split(/\s+/));
      const urls = parts.map(p => p[0]).filter(u => u && u.startsWith('http') && !/(logo|icon)/i.test(u));
      if (urls.length) return urls[urls.length - 1]; // highest res
    }
    return null;
  });
  return srcsetImg || null;
}

async function main() {
  console.log('\n🖥️  Browser-based bike image scraper');
  console.log('─'.repeat(50));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  let downloaded = 0;
  let failed = 0;

  for (const target of TARGETS) {
    const page = await context.newPage();
    process.stdout.write(`\n${target.slug}\n  Loading ${target.url.substring(0, 70)}...\n`);

    try {
      await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });

      // Try to wait for the product image
      try {
        await page.waitForSelector(target.waitFor, { timeout: 8000 });
      } catch {
        // If selector not found, still try to extract
      }

      // Extra wait for lazy-loaded images
      await page.waitForTimeout(2000);

      const imgUrl = await extractBestProductImage(page, target.slug);

      if (!imgUrl) {
        console.log(`  ✗ No product image found`);
        failed++;
        await page.close();
        continue;
      }

      console.log(`  Found: ${imgUrl.substring(0, 90)}`);

      // Download the image
      const imgResponse = await page.goto(imgUrl, { timeout: 20000 });
      if (!imgResponse?.ok()) {
        console.log(`  ✗ Image URL returned ${imgResponse?.status()}`);
        failed++;
        await page.close();
        continue;
      }

      const buffer = await imgResponse.body();
      const contentType = imgResponse.headers()['content-type'] || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png'
        : contentType.includes('webp') ? 'webp'
        : contentType.includes('gif') ? 'gif'
        : 'jpg';

      const filename = `${target.slug}.${ext}`;
      writeFileSync(`${OUT_DIR}/${filename}`, buffer);
      console.log(`  ✓ Downloaded ${filename} (${(buffer.length / 1024).toFixed(0)}KB)`);

      await sql`
        UPDATE bikes SET hero_image_url = ${`/images/bikes/${filename}`}, updated_at = NOW()
        WHERE slug = ${target.slug}
      `;
      downloaded++;

    } catch (err) {
      console.log(`  ✗ Error: ${err.message.substring(0, 80)}`);
      failed++;
    }

    await page.close();
  }

  await browser.close();
  await sql.end();

  console.log('\n' + '─'.repeat(50));
  console.log(`✅ ${downloaded} downloaded, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
