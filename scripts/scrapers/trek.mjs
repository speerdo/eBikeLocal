/**
 * Trek Store Finder Scraper
 * Method: Trek OCC (SAP Commerce Cloud) REST API — no browser needed
 * Endpoint: api.trekbikes.com/occ/v2/us/stores
 * Strategy: Single query from US center with radius=5000000m covers all 1,446 US stores
 *           across 8 pages of 200 results each.
 * Est. dealers: ~1,446
 */
import { stageRecord, rateLimit, log, sql } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'trek';
const BASE = 'https://api.trekbikes.com/occ/v2/us/stores';
// 5000km radius from geographic center of US covers all 50 states
const CENTER_LAT = 39.5;
const CENTER_LNG = -98.35;
const RADIUS = 5000000; // meters

export async function scrapeTrek() {
  log(SOURCE, 'Starting Trek store scrape via OCC API...');

  let totalSaved = 0;
  let currentPage = 0;
  let totalPages = 1;
  const seenIds = new Set();

  while (currentPage < totalPages) {
    await rateLimit('api.trekbikes.com', 800);

    const url = `${BASE}?radius=${RADIUS}&fields=FULL&pageSize=200&currentPage=${currentPage}&latitude=${CENTER_LAT}&longitude=${CENTER_LNG}&lang=en_US&curr=USD`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        log(SOURCE, `API error ${res.status} on page ${currentPage}`);
        break;
      }

      const data = await res.json();
      const { pagination, stores = [] } = data;

      if (currentPage === 0) {
        totalPages = pagination.totalPages;
        log(SOURCE, `Total Trek stores: ${pagination.totalResults} across ${totalPages} pages`);
      }

      for (const store of stores) {
        const id = store.address?.id || store.url || `${store.displayName}-${store.address?.town}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const record = normalizeTrek(store);
        if (!record.name || !record.stateCode) continue;

        const saved = await stageRecord(record);
        if (saved) totalSaved++;
      }

      log(SOURCE, `Page ${currentPage + 1}/${totalPages}: ${stores.length} stores. Staged: ${totalSaved}`);
      currentPage++;
    } catch (err) {
      log(SOURCE, `Error on page ${currentPage}: ${err.message}`);
      break;
    }
  }

  log(SOURCE, `Staged ${totalSaved} Trek stores.`);
  return totalSaved;
}

function normalizeTrek(raw) {
  const addr = raw.address || {};
  const region = addr.region || {};
  const geo = raw.geoPoint || {};

  // Features: ebike-related capabilities (may be array or object)
  const features = Array.isArray(raw.features) ? raw.features : [];

  // Opening hours → store in raw for reference
  const state = region.isocodeShort || '';

  return {
    source: SOURCE,
    sourceId: addr.id ? String(addr.id) : null,
    rawData: raw,
    name: raw.displayName || raw.name || '',
    address: addr.line1 || '',
    city: addr.town || '',
    state,
    stateCode: state.length === 2 ? state.toUpperCase() : null,
    zip: (addr.postalCode || '').split('-')[0], // strip ZIP+4
    latitude: geo.latitude ? parseFloat(geo.latitude) : null,
    longitude: geo.longitude ? parseFloat(geo.longitude) : null,
    phone: addr.phone || '',
    website: raw.url ? `https://www.trekbikes.com${raw.url}` : '',
    email: addr.email || null,
    brandName: 'Trek',
    dealerTier: raw.ecommEnabled ? 'authorized_online' : 'authorized',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeTrek().then(n => {
    console.log(`\nTrek scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Trek scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
