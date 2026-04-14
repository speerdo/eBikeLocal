/**
 * Lectric eBikes Dealer Scraper
 * Method: Playwright — crawls the Shopify blog-based store locator
 *
 * Lectric uses Shopify blog articles as dealer pages:
 *   List:   lectricebikes.com/a/store-locator/list
 *   Dealer: lectricebikes.com/a/store-locator/{dealer-slug}
 *
 * Est. dealers: 300–500
 */
import { stageRecord, rateLimit, log, sql, sleep, launchBrowser, newPage, toStateCode } from './utils.mjs';
import { fileURLToPath } from 'url';
import { load } from 'cheerio';

const SOURCE = 'lectric';
const BRAND = 'Lectric eBikes';
const BASE = 'https://lectricebikes.com';
const LIST_URL = `${BASE}/a/store-locator/list`;

export async function scrapeLectric() {
  log(SOURCE, 'Starting Lectric dealer scrape via Playwright...');

  const browser = await launchBrowser();
  let dealerLinks = [];

  try {
    // ── Step 1: Collect all dealer page links from the list page ──────────────
    const page = await newPage(browser);
    log(SOURCE, `Loading list page: ${LIST_URL}`);

    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(4000); // allow JS to render dealer links

    // Scroll to bottom to trigger any lazy-loaded content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1000);

    const html = await page.content();
    await page.close();

    const $ = load(html);

    // Collect all links pointing to /a/store-locator/* (excluding the list page itself)
    $('a[href*="/a/store-locator/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const full = href.startsWith('http') ? href
        : href.startsWith('//') ? `https:${href}`
        : `${BASE}${href}`;
      if (!full.includes('/list') && !dealerLinks.includes(full)) {
        dealerLinks.push(full);
      }
    });

    // Also check for links in anchor tags with store-locator pattern
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.match(/\/a\/store-locator\/[^/]+$/) && !href.includes('/list')) {
        const full = href.startsWith('http') ? href
          : href.startsWith('//') ? `https:${href}`
          : `${BASE}${href}`;
        if (!dealerLinks.includes(full)) dealerLinks.push(full);
      }
    });

    log(SOURCE, `Found ${dealerLinks.length} dealer page links`);

    if (dealerLinks.length === 0) {
      log(SOURCE, 'WARNING: No dealer links found on list page — site may have changed structure');
      log(SOURCE, 'Attempting sitemap fallback...');
      dealerLinks = await discoverViaXmlSitemap();
      log(SOURCE, `Sitemap found ${dealerLinks.length} dealer links`);
    }
  } catch (err) {
    log(SOURCE, `List page error: ${err.message}`);
    await browser.close();
    return 0;
  }

  if (dealerLinks.length === 0) {
    log(SOURCE, 'No dealer links found. Aborting.');
    await browser.close();
    return 0;
  }

  // ── Step 2: Scrape each dealer page ────────────────────────────────────────
  let totalSaved = 0;
  let errors = 0;

  for (const link of dealerLinks) {
    await rateLimit('lectricebikes.com', 1500);

    try {
      const page = await newPage(browser);

      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(1500);

      const html = await page.content();
      await page.close();

      const dealer = parseDealerPage(html, link);
      if (!dealer.name) {
        log(SOURCE, `  No name parsed at ${link}`);
        continue;
      }

      const saved = await stageRecord(dealer);
      if (saved) {
        totalSaved++;
        if (totalSaved % 25 === 0) {
          log(SOURCE, `  ${totalSaved} staged so far... (${link.split('/').pop()})`);
        }
      }
    } catch (err) {
      log(SOURCE, `  Error at ${link}: ${err.message}`);
      errors++;
    }
  }

  await browser.close();
  log(SOURCE, `Scrape complete: ${totalSaved} staged, ${errors} errors from ${dealerLinks.length} pages`);
  return totalSaved;
}

// ── Sitemap fallback: discover dealer URLs from XML sitemap ──────────────────

async function discoverViaXmlSitemap() {
  const links = [];
  try {
    const sitemapRes = await fetch(`${BASE}/sitemap.xml`, {
      headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!sitemapRes.ok) return links;

    const sitemapText = await sitemapRes.text();
    // Look for sub-sitemaps or blog article URLs
    const subSitemaps = [...sitemapText.matchAll(/<loc>(https?:\/\/[^<]+sitemap[^<]+)<\/loc>/gi)]
      .map(m => m[1]);

    for (const sub of subSitemaps) {
      await rateLimit('lectricebikes.com', 500);
      try {
        const res = await fetch(sub, {
          headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const text = await res.text();
        const urls = [...text.matchAll(/<loc>(https?:\/\/lectricebikes\.com\/a\/store-locator\/[^<]+)<\/loc>/gi)]
          .map(m => m[1])
          .filter(u => !u.includes('/list'));
        links.push(...urls);
      } catch { /* skip */ }
    }

    // Also check the main sitemap directly for store-locator URLs
    const direct = [...sitemapText.matchAll(/<loc>(https?:\/\/lectricebikes\.com\/a\/store-locator\/[^<]+)<\/loc>/gi)]
      .map(m => m[1])
      .filter(u => !u.includes('/list'));
    links.push(...direct);
  } catch (err) {
    log(SOURCE, `Sitemap error: ${err.message}`);
  }
  return [...new Set(links)];
}

// ── Parse individual dealer page ─────────────────────────────────────────────

function parseDealerPage(html, url) {
  const $ = load(html);

  // Lectric dealer pages are Shopify blog articles with structured info
  // Common patterns: h1 for name, paragraphs/divs for address details

  const name = $('h1').first().text().trim()
    || $('[class*="title"]').first().text().trim()
    || '';

  // Try to extract structured address from page text
  const bodyText = $('article, .article, main, .page-content, .rte').text();

  // Parse address from body text using common patterns
  const addressMatch = bodyText.match(/(\d+[^,\n]+),?\s*([^,\n]+),?\s*([A-Z]{2})\s+(\d{5})/);

  let address = '';
  let city = '';
  let stateCode = '';
  let zip = '';

  if (addressMatch) {
    address = addressMatch[1]?.trim() || '';
    city = addressMatch[2]?.trim() || '';
    stateCode = addressMatch[3]?.trim() || '';
    zip = addressMatch[4]?.trim() || '';
  }

  // Also try meta description which often has address info
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  if (!city && metaDesc) {
    const metaMatch = metaDesc.match(/([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
    if (metaMatch) {
      city = metaMatch[1]?.trim() || '';
      stateCode = metaMatch[2]?.trim() || '';
      zip = metaMatch[3]?.trim() || '';
    }
  }

  // Phone: look for tel: links or phone patterns
  const phone = $('a[href^="tel:"]').first().attr('href')?.replace('tel:', '')
    || bodyText.match(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0]
    || '';

  // Website: look for external links in dealer content
  const externalLink = $('article a[href^="http"], .article a[href^="http"]')
    .filter((_, el) => {
      const href = $(el).attr('href') || '';
      return !href.includes('lectricebikes.com') && !href.includes('instagram') && !href.includes('facebook');
    })
    .first().attr('href') || '';

  // Dealer tier from page content
  const lowerBody = bodyText.toLowerCase();
  const dealerTier = lowerBody.includes('test ride') ? 'test_ride'
    : lowerBody.includes('rental') ? 'rental'
    : lowerBody.includes('best buy') ? 'retail'
    : 'retail';

  return {
    source: SOURCE,
    sourceId: url.split('/').pop().replace('.html', ''),
    rawData: { url, name, address, city, stateCode, zip, phone, website: externalLink, bodyText: bodyText.slice(0, 500) },
    name,
    address,
    city,
    state: stateCode,
    stateCode: stateCode || null,
    zip,
    latitude: null, // no coords on page, will be enriched via Google Places
    longitude: null,
    phone,
    website: externalLink,
    email: null,
    brandName: BRAND,
    dealerTier,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeLectric().then(n => {
    console.log(`\nLectric scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Lectric scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
