/**
 * Shop logo scraper
 * Fetches the homepage of each shop website and extracts a high-quality logo URL.
 *
 * Priority order:
 *   1. <link rel="apple-touch-icon">        — highest quality, always square, 180px+
 *   2. <meta property="og:image">           — Open Graph image, often the logo/hero
 *   3. <img> with "logo" in src/alt/class   — explicit logo element
 *   4. <link rel="icon" sizes="192x192+">   — large PWA icon
 *   5. Falls back to existing favicon URL   — already in logo_url column
 *
 * Usage:
 *   node scripts/scrapers/shop-logos.mjs              # scrape all with website, no scraped logo yet
 *   node scripts/scrapers/shop-logos.mjs --limit 50   # test run
 *   node scripts/scrapers/shop-logos.mjs --retry      # retry previously failed rows
 */
import { load } from 'cheerio';
import { env, log, rateLimit, sleep, sql } from './utils.mjs';
import { fileURLToPath } from 'url';

const CONCURRENCY    = 5;     // parallel fetches
const TIMEOUT_MS     = 8000; // per-page timeout (normal pass)
const TIMEOUT_RETRY  = 15000;// per-page timeout (retry pass)
const RATE_MS        = 300;  // min ms between requests to same domain

// ── Chain domain overrides ────────────────────────────────────────────────────
// Sites that block scraping — map root domain → known stable logo URL.
// Use Google's favicon service (confirmed working) so we get a real image.
const CHAIN_LOGOS = {
  'rei.com':                        'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://rei.com&size=128',
  'pedegoelectricbikes.com':        'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://pedegoelectricbikes.com&size=128',
  'scheels.com':                    'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://scheels.com&size=128',
  'danscomp.com':                   'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://danscomp.com&size=128',
};

// Domains that are social/listing pages — no useful shop logo to scrape.
const SKIP_DOMAINS = new Set([
  'facebook.com', 'm.facebook.com',
  'instagram.com', 'yelp.com', 'google.com',
  'maps.google.com', 'linktr.ee',
]);

// ── HTML fetch ────────────────────────────────────────────────────────────────

async function fetchHtml(url, { retry = false } = {}) {
  await rateLimit(new URL(url).hostname, RATE_MS);
  const res = await fetch(url, {
    headers: {
      // Use a real browser UA on retries to bypass basic bot detection
      'User-Agent': retry
        ? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        : 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(retry ? TIMEOUT_RETRY : TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('html')) throw new Error(`Not HTML: ${ct}`);
  return { html: await res.text(), finalUrl: res.url };
}

// ── URL resolution ────────────────────────────────────────────────────────────

function resolveUrl(href, base) {
  if (!href) return null;
  href = href.trim();
  if (!href || href.startsWith('data:')) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

// ── Logo extraction priority chain ───────────────────────────────────────────

function extractLogo(html, baseUrl) {
  const $ = load(html);

  // 1. apple-touch-icon — designed to be high quality square brand mark
  for (const el of $('link[rel~="apple-touch-icon"]').toArray()) {
    const href = resolveUrl($(el).attr('href'), baseUrl);
    if (href) return { url: href, source: 'apple-touch-icon' };
  }

  // 2. OG image — usually the brand logo or a good hero shot
  const ogImage = resolveUrl($('meta[property="og:image"]').attr('content'), baseUrl);
  if (ogImage) return { url: ogImage, source: 'og:image' };

  // 3. <img> tag with "logo" in src, class, alt, or id
  for (const el of $('img').toArray()) {
    const src   = $(el).attr('src') || '';
    const alt   = ($(el).attr('alt') || '').toLowerCase();
    const cls   = ($(el).attr('class') || '').toLowerCase();
    const id    = ($(el).attr('id') || '').toLowerCase();
    const isLogo = /logo/.test(src.toLowerCase()) || /logo/.test(alt)
                || /logo/.test(cls) || /logo/.test(id);
    if (isLogo) {
      const href = resolveUrl(src, baseUrl);
      if (href) return { url: href, source: 'img[logo]' };
    }
  }

  // 4. Large PWA / manifest icon (192px+)
  for (const el of $('link[rel~="icon"]').toArray()) {
    const sizes = $(el).attr('sizes') || '';
    const w = parseInt(sizes.split('x')[0]) || 0;
    if (w >= 192) {
      const href = resolveUrl($(el).attr('href'), baseUrl);
      if (href) return { url: href, source: `icon-${sizes}` };
    }
  }

  // 5. Any icon as last resort
  for (const rel of ['shortcut icon', 'icon']) {
    const el = $(`link[rel="${rel}"]`).first();
    const href = resolveUrl(el.attr('href'), baseUrl);
    if (href) return { url: href, source: rel };
  }

  return null;
}

// ── Process one shop ──────────────────────────────────────────────────────────

async function processShop(row, { retry = false } = {}) {
  // Clean up messy website values (e.g. two URLs concatenated)
  const rawUrl = (row.website || '').trim().split(/\s+/)[0];
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { place_id: row.place_id, error: `Invalid URL: ${rawUrl}`, source: 'skip' };
  }

  const rootDomain = parsedUrl.hostname.replace(/^www\./, '');

  // Skip social/listing pages — no shop logo to scrape
  if (SKIP_DOMAINS.has(rootDomain) || SKIP_DOMAINS.has(parsedUrl.hostname)) {
    return { place_id: row.place_id, error: 'social/listing page', source: 'skip' };
  }

  // Chain override — use known logo URL without fetching
  for (const [chainDomain, logoUrl] of Object.entries(CHAIN_LOGOS)) {
    if (rootDomain === chainDomain || rootDomain.endsWith('.' + chainDomain)) {
      return { place_id: row.place_id, logo: logoUrl, source: `chain:${chainDomain}` };
    }
  }

  // Use just the origin (homepage) — strip deep paths like /pages/berkeley
  const url = parsedUrl.origin + '/';

  try {
    const { html, finalUrl } = await fetchHtml(url, { retry });
    const result = extractLogo(html, finalUrl);
    if (result) {
      return { place_id: row.place_id, logo: result.url, source: result.source };
    }
    return { place_id: row.place_id, error: 'No logo found in HTML' };
  } catch (err) {
    return { place_id: row.place_id, error: err.message };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const limit   = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const doRetry = args.includes('--retry');

// Fetch rows to process
const rows = doRetry
  ? await sql`
      SELECT place_id, website FROM google_places_raw
      WHERE details_fetched = true
        AND website IS NOT NULL
        AND logo_scraped_url = 'ERROR'
      ORDER BY rating DESC NULLS LAST
      ${limit ? sql`LIMIT ${limit}` : sql``}
    `
  : await sql`
      SELECT place_id, website FROM google_places_raw
      WHERE details_fetched = true
        AND website IS NOT NULL
        AND logo_scraped_url IS NULL
      ORDER BY rating DESC NULLS LAST
      ${limit ? sql`LIMIT ${limit}` : sql``}
    `;

if (rows.length === 0) {
  log('shop-logos', 'No rows to process.');
  await sql.end();
  process.exit(0);
}

log('shop-logos', `Processing ${rows.length} shops (concurrency=${CONCURRENCY})...`);

let found = 0;
let failed = 0;
const sourceCounts = {};

// Process in batches of CONCURRENCY
for (let i = 0; i < rows.length; i += CONCURRENCY) {
  const batch = rows.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(r => processShop(r, { retry: doRetry })));

  for (const r of results) {
    if (r.logo) {
      await sql`
        UPDATE google_places_raw
        SET logo_scraped_url = ${r.logo}
        WHERE place_id = ${r.place_id}
      `;
      found++;
      sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
    } else {
      // 'skip' = social/listing page, won't ever yield a logo — mark permanently
      const marker = r.source === 'skip' ? 'SKIP' : 'ERROR';
      await sql`
        UPDATE google_places_raw
        SET logo_scraped_url = ${marker}
        WHERE place_id = ${r.place_id}
      `;
      failed++;
    }
  }

  // Progress every 100
  const done = i + batch.length;
  if (done % 100 === 0 || done === rows.length) {
    log('shop-logos', `  ${done}/${rows.length} — found: ${found}, failed: ${failed}`);
  }
}

log('shop-logos', `Done: ${found} logos found, ${failed} failed`);
log('shop-logos', `Sources: ${Object.entries(sourceCounts).map(([k,v]) => `${k}=${v}`).join(', ')}`);

// Final DB stats
const [stats] = await sql`
  SELECT
    COUNT(*) FILTER (WHERE logo_scraped_url IS NOT NULL AND logo_scraped_url NOT IN ('ERROR','SKIP')) as scraped,
    COUNT(*) FILTER (WHERE logo_scraped_url = 'ERROR') as errors,
    COUNT(*) FILTER (WHERE logo_scraped_url = 'SKIP') as skipped,
    COUNT(*) FILTER (WHERE logo_scraped_url IS NULL AND website IS NOT NULL) as pending
  FROM google_places_raw
  WHERE details_fetched = true
`;
log('shop-logos', `DB state — scraped: ${stats.scraped}, errors: ${stats.errors}, skipped: ${stats.skipped}, pending: ${stats.pending}`);

await sql.end();
