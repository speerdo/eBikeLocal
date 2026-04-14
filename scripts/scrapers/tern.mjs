/**
 * Tern Bicycles Dealer Scraper
 * URL: ternbicycles.com/us/dealers/map
 * Method: Playwright (site returns 403 to non-browser user agents)
 * Individual dealer pages at /us/dealers/{id}
 * Est. dealers: 100–200+
 */
import { load } from 'cheerio';
import { stageRecord, rateLimit, log, sql, sleep, launchBrowser, newPage, toStateCode } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'tern';
const BASE = 'https://www.ternbicycles.com';
const MAP_URL = `${BASE}/us/dealers/map`;

export async function scrapeTern() {
  log(SOURCE, 'Starting Tern dealer scrape (Playwright)...');

  // 1. Discover dealer links (uses Playwright internally)
  const dealerLinks = await discoverDealerLinks();
  log(SOURCE, `Found ${dealerLinks.length} dealer links`);

  if (dealerLinks.length === 0) {
    log(SOURCE, 'No dealer links found — aborting.');
    return 0;
  }

  let totalSaved = 0;

  // Path A: pre-loaded dealer data from API interception
  if (dealerLinks[0] === '__preloaded__' && discoverDealerLinks._preloaded) {
    log(SOURCE, `Staging ${discoverDealerLinks._preloaded.length} dealers from intercepted API data`);
    for (const raw of discoverDealerLinks._preloaded) {
      const dealer = normalizeTernApi(raw);
      if (!dealer.name) continue;
      const saved = await stageRecord(dealer);
      if (saved) totalSaved++;
    }
    log(SOURCE, `Staged ${totalSaved} Tern dealers from API.`);
    return totalSaved;
  }

  // Path B: scrape individual dealer pages with Playwright
  const browser = await launchBrowser();

  for (const link of dealerLinks) {
    await rateLimit('ternbicycles.com', 1500);

    try {
      const page = await newPage(browser);
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(500);
      const html = await page.content();
      await page.close();

      const dealer = parseTernPage(html, link);
      if (!dealer.name) continue;

      const saved = await stageRecord(dealer);
      if (saved) {
        totalSaved++;
        if (totalSaved % 20 === 0) log(SOURCE, `  ${totalSaved} staged...`);
      }
    } catch (err) {
      log(SOURCE, `Error scraping ${link}: ${err.message}`);
    }
  }

  await browser.close();
  log(SOURCE, `Staged ${totalSaved} Tern dealers.`);
  return totalSaved;
}

async function discoverDealerLinks() {
  // ternbicycles.com blocks non-browser user agents (403).
  // Use Playwright and intercept the Drupal Geofield / dealer API call that
  // the JS map makes after page load to load marker data.
  const { launchBrowser, newPage } = await import('./utils.mjs');
  const browser = await launchBrowser();
  const links = new Set();
  let interceptedData = null;

  try {
    const page = await newPage(browser);

    // Intercept XHR/fetch calls to capture dealer data API responses
    const apiResponses = [];
    page.on('response', async (response) => {
      const url = response.url();
      // Capture any JSON responses that look like dealer/location data
      if ((url.includes('dealer') || url.includes('location') || url.includes('store') || url.includes('geofield'))
          && response.headers()['content-type']?.includes('json')) {
        try {
          const json = await response.json();
          apiResponses.push({ url, json });
        } catch { /* not JSON */ }
      }
    });

    await page.goto(MAP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);

    // Check intercepted API responses for dealer data
    for (const { url: apiUrl, json } of apiResponses) {
      log(SOURCE, `  Intercepted API: ${apiUrl}`);
      const dealers = extractDealersFromJson(json);
      if (dealers.length > 0) {
        log(SOURCE, `  Found ${dealers.length} dealers in API response`);
        interceptedData = dealers;
        break;
      }
    }

    // If no API interception, try parsing the HTML for dealer links or inline JSON
    if (!interceptedData) {
      const html = await page.content();
      const $ = load(html);

      // Look for dealer links
      $('a[href*="/us/dealers/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.endsWith('/map') && !href.endsWith('/dealers/')) {
          const full = href.startsWith('http') ? href : `${BASE}${href}`;
          links.add(full);
        }
      });

      // Look for Drupal settings or inline JSON with dealer data
      $('script:not([src])').each((_, el) => {
        const text = $(el).html() || '';
        if (text.includes('dealers') || text.includes('locations') || text.includes('drupalSettings')) {
          try {
            const jsonMatch = text.match(/drupalSettings\s*=\s*({.+?});/s)
              || text.match(/var\s+\w+\s*=\s*(\[.+?\]);/s);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              const dealers = extractDealersFromJson(data);
              if (dealers.length > 0) {
                interceptedData = dealers;
                log(SOURCE, `  Found ${dealers.length} dealers in inline JS`);
              }
            }
          } catch { /* ignore parse errors */ }
        }
      });

      log(SOURCE, `Map page HTML: ${links.size} dealer links, intercepted: ${interceptedData?.length || 0}`);
    }

    await page.close();
  } catch (err) {
    log(SOURCE, `Map page error: ${err.message}`);
  } finally {
    await browser.close();
  }

  // If we got intercepted dealer data, return those as pre-parsed records
  if (interceptedData && interceptedData.length > 0) {
    // Store the pre-parsed data for use in scrapeTern
    discoverDealerLinks._preloaded = interceptedData;
    return ['__preloaded__'];
  }

  return [...links];
}

discoverDealerLinks._preloaded = null;

function extractDealersFromJson(json) {
  const dealers = [];
  if (!json) return dealers;

  const candidates = Array.isArray(json) ? json
    : json.dealers || json.locations || json.stores || json.data || [];

  for (const item of (Array.isArray(candidates) ? candidates : [])) {
    if (item.name || item.title || item.store_name) {
      dealers.push(item);
    }
  }
  return dealers;
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

// Normalize dealer data returned directly from an intercepted API response
function normalizeTernApi(raw) {
  const state = raw.state || raw.province || raw.address?.region || '';
  return {
    source: 'tern',
    sourceId: raw.id ? String(raw.id) : null,
    rawData: raw,
    name: raw.name || raw.title || raw.store_name || '',
    address: raw.address?.street || raw.street || raw.address1 || '',
    city: raw.address?.city || raw.city || '',
    state,
    stateCode: toStateCode(state),
    zip: raw.address?.postal_code || raw.zip || raw.postal_code || '',
    latitude: raw.lat ? parseFloat(raw.lat) : null,
    longitude: raw.lng ? parseFloat(raw.lng) : null,
    phone: raw.phone || raw.telephone || '',
    website: raw.url || raw.website || '',
    email: raw.email || null,
    brandName: 'Tern',
    dealerTier: raw.dealer_type || 'authorized',
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
