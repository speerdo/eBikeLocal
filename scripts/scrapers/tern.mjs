/**
 * Tern Bicycles Dealer Scraper
 * URL: ternbicycles.com/us/dealers/map
 * Method: Cheerio (server-rendered Drupal)
 * Individual dealer pages at /us/dealers/{id}
 * Est. dealers: 100–200+
 */
import { load } from 'cheerio';
import { stageRecord, rateLimit, log, sql, sleep, toStateCode } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'tern';
const BASE = 'https://www.ternbicycles.com';
const MAP_URL = `${BASE}/us/dealers/map`;

export async function scrapeTern() {
  log(SOURCE, 'Starting Tern dealer scrape...');

  // 1. Get the map page to discover dealer IDs
  const dealerLinks = await discoverDealerLinks();
  log(SOURCE, `Found ${dealerLinks.length} dealer links`);

  let totalSaved = 0;

  for (const link of dealerLinks) {
    await rateLimit('ternbicycles.com', 1500);

    try {
      const res = await fetch(link, {
        headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) continue;
      const html = await res.text();
      const dealer = parseTernPage(html, link);

      if (!dealer.name) continue;
      const saved = await stageRecord(dealer);
      if (saved) {
        totalSaved++;
        log(SOURCE, `Staged: ${dealer.name}, ${dealer.city}`);
      }
    } catch (err) {
      log(SOURCE, `Error scraping ${link}: ${err.message}`);
    }
  }

  log(SOURCE, `Staged ${totalSaved} Tern dealers.`);
  return totalSaved;
}

async function discoverDealerLinks() {
  const links = new Set();

  try {
    await rateLimit('ternbicycles.com', 2000);
    const res = await fetch(MAP_URL, {
      headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const $ = load(html);

    // Drupal renders dealer links in the map page
    $('a[href*="/us/dealers/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.endsWith('/map') && !href.endsWith('/dealers/')) {
        const full = href.startsWith('http') ? href : `${BASE}${href}`;
        links.add(full);
      }
    });

    // Also look for data attributes with dealer IDs
    $('[data-dealer-id], [data-id]').each((_, el) => {
      const id = $(el).data('dealer-id') || $(el).data('id');
      if (id) links.add(`${BASE}/us/dealers/${id}`);
    });
  } catch (err) {
    log(SOURCE, `Map page error: ${err.message}`);
  }

  return [...links];
}

function parseTernPage(html, url) {
  const $ = load(html);

  const name = $('h1').first().text().trim();

  // Try JSON-LD first
  let address = '', city = '', state = '', zip = '', phone = '', website = '';
  const jsonLd = $('script[type="application/ld+json"]').first().text();
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd);
      const addr = data.address || {};
      address = addr.streetAddress || '';
      city = addr.addressLocality || '';
      state = addr.addressRegion || '';
      zip = addr.postalCode || '';
      phone = data.telephone || '';
      website = data.url || '';
    } catch { /* fallback */ }
  }

  // Fallback: HTML parsing
  if (!city) {
    address = $('[itemprop="streetAddress"], .street-address').text().trim();
    city = $('[itemprop="addressLocality"], .locality').text().trim();
    state = $('[itemprop="addressRegion"], .region').text().trim();
    zip = $('[itemprop="postalCode"], .postal-code').text().trim();
  }

  if (!phone) phone = $('[itemprop="telephone"], a[href^="tel:"]').first().text().trim();
  if (!website) website = $('a[href^="http"]').filter((_, el) => !$(el).attr('href')?.includes('ternbicycles')).first().attr('href') || '';

  const isPreferred = html.toLowerCase().includes('preferred dealer');

  return {
    source: 'tern',
    sourceId: url.split('/').pop(),
    rawData: { url, name, address, city, state, zip, phone, website },
    name,
    address,
    city,
    state,
    stateCode: toStateCode(state),
    zip,
    latitude: null,
    longitude: null,
    phone,
    website,
    email: null,
    brandName: 'Tern',
    dealerTier: isPreferred ? 'preferred' : 'authorized',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeTern().then(n => {
    console.log(`\nTern scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Tern scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
