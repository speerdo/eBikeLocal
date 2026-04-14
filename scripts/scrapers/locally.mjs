/**
 * Locally.com Widget Scraper
 * Covers: Cannondale, Gazelle
 *
 * Locally doesn't expose a clean JSON API. The endpoint
 * `{brand}.locally.com/stores/map.js` returns a JavaScript widget that
 * embeds dealer HTML using `data-switchlive-*` attributes.
 * We fetch that JS, extract the embedded HTML, then parse with Cheerio.
 *
 * Confirmed company IDs:
 *   Cannondale: 2262  (from cannondale.com/en-us/find-a-dealer source)
 *   Gazelle:    156743 (from locally.com/brand/gazelle-bikes source)
 */
import { load } from 'cheerio';
import { stageRecord, rateLimit, log, sql, sleep, toStateCode } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'locally';

const BRANDS = [
  { name: 'Cannondale', slug: 'cannondale', companyId: 2262,   subdomain: 'cannondale' },
  { name: 'Gazelle',    slug: 'gazelle',    companyId: 156743, subdomain: 'gazelle-bikes' },
];

// Dense US metro grid — 150-mile radius per point covers most of the country
const US_GRID = [
  { lat: 40.71, lng: -74.01 }, // New York
  { lat: 34.05, lng: -118.24 }, // Los Angeles
  { lat: 41.85, lng: -87.65 }, // Chicago
  { lat: 29.76, lng: -95.37 }, // Houston
  { lat: 33.45, lng: -112.07 }, // Phoenix
  { lat: 39.95, lng: -75.17 }, // Philadelphia
  { lat: 29.95, lng: -90.07 }, // New Orleans
  { lat: 32.72, lng: -117.16 }, // San Diego
  { lat: 32.79, lng: -96.80 }, // Dallas
  { lat: 37.34, lng: -121.89 }, // San Jose
  { lat: 30.27, lng: -97.74 }, // Austin
  { lat: 30.33, lng: -81.66 }, // Jacksonville
  { lat: 39.10, lng: -84.51 }, // Cincinnati
  { lat: 37.77, lng: -122.42 }, // San Francisco
  { lat: 39.74, lng: -104.98 }, // Denver
  { lat: 35.23, lng: -80.84 }, // Charlotte
  { lat: 36.17, lng: -86.78 }, // Nashville
  { lat: 42.33, lng: -83.05 }, // Detroit
  { lat: 38.91, lng: -77.04 }, // Washington DC
  { lat: 47.61, lng: -122.33 }, // Seattle
  { lat: 44.98, lng: -93.27 }, // Minneapolis
  { lat: 33.75, lng: -84.39 }, // Atlanta
  { lat: 25.77, lng: -80.19 }, // Miami
  { lat: 27.95, lng: -82.46 }, // Tampa
  { lat: 39.29, lng: -76.61 }, // Baltimore
  { lat: 42.36, lng: -71.06 }, // Boston
  { lat: 43.05, lng: -76.15 }, // Syracuse
  { lat: 41.50, lng: -81.69 }, // Cleveland
  { lat: 45.52, lng: -122.68 }, // Portland OR
  { lat: 36.17, lng: -115.14 }, // Las Vegas
  { lat: 35.47, lng: -97.52 }, // Oklahoma City
  { lat: 38.25, lng: -85.76 }, // Louisville
  { lat: 43.05, lng: -89.40 }, // Madison WI
  { lat: 46.88, lng: -96.79 }, // Fargo
  { lat: 43.55, lng: -116.24 }, // Boise
  { lat: 35.15, lng: -90.05 }, // Memphis
  { lat: 39.10, lng: -94.58 }, // Kansas City
  { lat: 38.63, lng: -90.20 }, // St. Louis
];

export async function scrapeLocally() {
  log(SOURCE, 'Starting Locally.com scrape (Cannondale, Gazelle)...');
  let totalSaved = 0;

  for (const brand of BRANDS) {
    const seenIds = new Set();
    log(SOURCE, `Scraping ${brand.name} (company_id=${brand.companyId})...`);

    for (const { lat, lng } of US_GRID) {
      await rateLimit(`${brand.subdomain}.locally.com`, 1000);

      // The map.js endpoint returns a JS widget with HTML embedded.
      // Using radius=250 (miles) to maximize coverage per request.
      // n_dealers controls how many results the widget returns — set high to maximise coverage
      const url = `https://${brand.subdomain}.locally.com/stores/map.js?company_id=${brand.companyId}&show_dealers=1&n_dealers=100&lat=${lat}&lng=${lng}&radius=100`;

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; eBikeLocalBot/1.0; +https://ebikelocal.com/bot)',
            'Accept': '*/*',
            'Referer': `https://www.${brand.subdomain === 'cannondale' ? 'cannondale' : 'gazellebikes'}.com`,
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          if (res.status !== 404) {
            log(SOURCE, `${brand.name}: HTTP ${res.status} at (${lat},${lng})`);
          }
          continue;
        }

        const jsText = await res.text();
        const stores = parseLocallyWidget(jsText);

        let newAtGrid = 0;
        for (const store of stores) {
          const id = String(store.storeId || `${store.name}-${store.city}`);
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const record = normalizeLocally(store, brand);
          if (!record.name || !record.city) continue;

          const saved = await stageRecord(record);
          if (saved) { totalSaved++; newAtGrid++; }
        }

        if (newAtGrid > 0) {
          log(SOURCE, `  (${lat.toFixed(1)},${lng.toFixed(1)}): +${newAtGrid} new | total unique: ${seenIds.size}`);
        }
      } catch (err) {
        log(SOURCE, `${brand.name} error at (${lat},${lng}): ${err.message}`);
      }
    }

    log(SOURCE, `${brand.name}: ${seenIds.size} unique dealers staged`);
    await sleep(3000);
  }

  log(SOURCE, `Total staged: ${totalSaved}`);
  return totalSaved;
}

// ── Parse Locally.com JS widget response ─────────────────────────────────────
//
// The response is a JS file that generates an HTML string containing dealer
// divs with data-switchlive-* attributes. We extract the HTML string from the
// JS and parse it with Cheerio.

function parseLocallyWidget(jsText) {
  const stores = [];

  // Strategy 1: extract HTML from the JS string and parse data attributes
  // The widget JS contains something like: document.getElementById(...).innerHTML = "...HTML..."
  // or a variable assignment with a long HTML string

  // Find all data-switchlive-store-id occurrences — each is one dealer
  const storeIdMatches = [...jsText.matchAll(/data-switchlive-store-id=["'](\d+)["']/g)];

  if (storeIdMatches.length > 0) {
    // Extract the full HTML blob containing dealer divs
    // The HTML is embedded as a JS string — find the chunk containing all stores
    const htmlStart = jsText.indexOf('data-switchlive-store-id');
    const htmlChunk = jsText.slice(Math.max(0, htmlStart - 5000), jsText.length);

    // Unescape JS string encoding (e.g. \u003c → <, \n → newline, \/ → /)
    const unescaped = htmlChunk
      .replace(/\\u003c/gi, '<')
      .replace(/\\u003e/gi, '>')
      .replace(/\\u0026/gi, '&')
      .replace(/\\\/\//g, '//')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");

    const $ = load(unescaped);

    $('[data-switchlive-store-id]').each((_, el) => {
      const $el = $(el);
      const storeId = $el.attr('data-switchlive-store-id');
      const name = $el.attr('data-switchlive-store-name')
        || $el.find('[class*="dealer-name"], .lcly-dealer-name').first().text().trim();
      const rawAddress = $el.attr('data-switchlive-store-address') || '';

      // Address format: "123 Main St, City, ST, 12345"
      const addrParts = rawAddress.split(',').map(p => p.trim());
      let address = '', city = '', stateCode = '', zip = '';

      if (addrParts.length >= 3) {
        zip = addrParts[addrParts.length - 1] || '';
        stateCode = addrParts[addrParts.length - 2] || '';
        city = addrParts[addrParts.length - 3] || '';
        address = addrParts.slice(0, addrParts.length - 3).join(', ');
      } else if (addrParts.length === 3) {
        address = addrParts[0];
        city = addrParts[1];
        stateCode = addrParts[2];
      }

      if (!name) return;
      stores.push({ storeId, name, address, city, stateCode: stateCode.trim().toUpperCase(), zip });
    });
  }

  // Strategy 2: regex fallback if Cheerio finds nothing
  if (stores.length === 0) {
    const nameMatches = [...jsText.matchAll(/lcly-dealer-name[^>]*>([^<]+)</g)];
    const addrMatches = [...jsText.matchAll(/data-switchlive-store-address=["']([^"']+)["']/g)];
    const idMatches   = [...jsText.matchAll(/data-switchlive-store-id=["'](\d+)["']/g)];

    for (let i = 0; i < idMatches.length; i++) {
      const rawAddr = addrMatches[i]?.[1] || '';
      const parts = rawAddr.split(',').map(p => p.trim());
      stores.push({
        storeId: idMatches[i][1],
        name: nameMatches[i]?.[1]?.trim() || '',
        address: parts[0] || '',
        city: parts[parts.length - 3] || '',
        stateCode: (parts[parts.length - 2] || '').toUpperCase(),
        zip: parts[parts.length - 1] || '',
      });
    }
  }

  return stores;
}

function normalizeLocally(store, brand) {
  return {
    source: `locally_${brand.slug}`,
    sourceId: store.storeId ? String(store.storeId) : null,
    rawData: store,
    name: store.name,
    address: store.address,
    city: store.city,
    state: store.stateCode,
    stateCode: store.stateCode?.length === 2 ? store.stateCode : null,
    zip: store.zip,
    latitude: null,
    longitude: null,
    phone: store.phone || null,
    website: store.website || null,
    email: null,
    brandName: brand.name,
    dealerTier: 'authorized',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeLocally().then(n => {
    console.log(`\nLocally scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Locally scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
