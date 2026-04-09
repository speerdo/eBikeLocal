/**
 * Pedego Dealer Scraper
 * URL: dealers.pedegoelectricbikes.com
 * Method: Crawl Shopify sitemap, then scrape individual dealer microsites
 * Est. dealers: 200+ franchise stores
 */
import { load } from 'cheerio';
import { stageRecord, rateLimit, log, sql, sleep, toStateCode } from './utils.mjs';

const SOURCE = 'pedego';
const BASE = 'https://dealers.pedegoelectricbikes.com';

export async function scrapePedego() {
  log(SOURCE, 'Starting Pedego dealer scrape...');

  // 1. Fetch sitemap to discover all dealer pages
  const dealerUrls = await discoverDealerUrls();
  log(SOURCE, `Found ${dealerUrls.length} dealer pages in sitemap`);

  let totalSaved = 0;

  for (const url of dealerUrls) {
    await rateLimit('dealers.pedegoelectricbikes.com', 1500);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) continue;

      const html = await res.text();
      const dealer = parsePedegoPage(html, url);
      if (!dealer.name) continue;

      const saved = await stageRecord(dealer);
      if (saved) totalSaved++;
      log(SOURCE, `Staged: ${dealer.name}, ${dealer.city}, ${dealer.stateCode}`);
    } catch (err) {
      log(SOURCE, `Error scraping ${url}: ${err.message}`);
    }
  }

  log(SOURCE, `Staged ${totalSaved} Pedego dealers.`);
  await sql.end();
  return totalSaved;
}

async function discoverDealerUrls() {
  const urls = [];

  // Try sitemap
  const sitemapUrls = [
    `${BASE}/sitemap.xml`,
    `${BASE}/sitemap_pages_1.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      await rateLimit('dealers.pedegoelectricbikes.com', 2000);
      const res = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'eBikeLocalBot/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const $ = load(xml, { xmlMode: true });

      $('loc').each((_, el) => {
        const loc = $(el).text().trim();
        // Pedego dealer pages are at /pages/dealers/{city-state}
        if (loc.includes('/pages/dealers/') && !loc.endsWith('/pages/dealers/')) {
          urls.push(loc);
        }
      });

      if (urls.length > 0) break;
    } catch (err) {
      log(SOURCE, `Sitemap error: ${err.message}`);
    }
  }

  return [...new Set(urls)];
}

function parsePedegoPage(html, url) {
  const $ = load(html);

  // Pedego dealer microsites use Shopify Liquid — common selectors
  const name = $('h1').first().text().trim() ||
               $('[class*="dealer-name"]').text().trim() ||
               $('[class*="store-name"]').text().trim();

  // Try to extract address from structured data first
  let address = '', city = '', state = '', zip = '', phone = '', website = '';
  const jsonLdScript = $('script[type="application/ld+json"]').first().text();
  if (jsonLdScript) {
    try {
      const ldData = JSON.parse(jsonLdScript);
      const addr = ldData.address || {};
      address = addr.streetAddress || '';
      city = addr.addressLocality || '';
      state = addr.addressRegion || '';
      zip = addr.postalCode || '';
      phone = ldData.telephone || '';
      website = ldData.url || url;
    } catch { /* fall through to HTML parsing */ }
  }

  // Fallback: parse from page text
  if (!city) {
    const addrBlock = $('[class*="address"], [class*="location"], [itemprop="address"]').first().text();
    const lines = addrBlock.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      address = lines[0];
      const cityStateZip = lines[lines.length - 1];
      const match = cityStateZip.match(/^(.+),\s*([A-Z]{2})\s*(\d{5})?/);
      if (match) {
        city = match[1].trim();
        state = match[2];
        zip = match[3] || '';
      }
    }
  }

  if (!phone) {
    phone = $('[href^="tel:"]').first().attr('href')?.replace('tel:', '') || '';
  }

  if (!website) {
    const siteLink = $('a[href*="http"]').filter((_, el) => {
      const href = $(el).attr('href') || '';
      return href.includes('pedego') && !href.includes('dealers.pedego');
    }).first().attr('href') || '';
    website = siteLink;
  }

  // Extract lat/lng if embedded in a map script
  let lat = null, lng = null;
  const pageText = html;
  const coordMatch = pageText.match(/"lat(?:itude)?"\s*:\s*([-\d.]+).*?"l(?:ng|on)(?:gitude)?"\s*:\s*([-\d.]+)/);
  if (coordMatch) {
    lat = parseFloat(coordMatch[1]);
    lng = parseFloat(coordMatch[2]);
  }

  const stateCode = toStateCode(state);

  return {
    source: 'pedego',
    sourceId: url.split('/').pop(),
    rawData: { url, name, address, city, state, zip, phone, website },
    name,
    address,
    city,
    state,
    stateCode,
    zip,
    latitude: lat,
    longitude: lng,
    phone,
    website,
    email: null,
    brandName: 'Pedego',
    dealerTier: 'franchise',
  };
}

scrapePedego().then(n => {
  console.log(`\nPedego scrape complete: ${n} records staged.`);
  process.exit(0);
}).catch(err => {
  console.error('Pedego scrape failed:', err);
  process.exit(1);
});
