/**
 * Locally.com API Scraper
 * Covers: Cannondale, Gazelle (and any other brand using Locally)
 * Endpoint: api.locally.com/stores/search
 * Method: Direct HTTP API — most structured data source
 */
import { stageRecord, rateLimit, log, sql, sleep } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'locally';

// Brand configs on Locally.com
// company_id values discoverable from network requests on brand sites
const BRANDS = [
  { name: 'Cannondale', slug: 'cannondale', companyId: 'cannondale' },
  { name: 'Gazelle', slug: 'gazelle', companyId: 'gazelle-bikes' },
];

// US coverage grid
const US_GRID = [
  { lat: 40.71, lng: -74.01 }, { lat: 34.05, lng: -118.24 }, { lat: 41.85, lng: -87.65 },
  { lat: 29.76, lng: -95.37 }, { lat: 33.45, lng: -112.07 }, { lat: 39.95, lng: -75.17 },
  { lat: 29.95, lng: -90.07 }, { lat: 32.72, lng: -117.16 }, { lat: 32.79, lng: -96.80 },
  { lat: 37.34, lng: -121.89 }, { lat: 30.27, lng: -97.74 }, { lat: 30.33, lng: -81.66 },
  { lat: 39.10, lng: -84.51 }, { lat: 37.77, lng: -122.42 }, { lat: 39.74, lng: -104.98 },
  { lat: 35.23, lng: -80.84 }, { lat: 36.17, lng: -86.78 }, { lat: 42.33, lng: -83.05 },
  { lat: 38.91, lng: -77.04 }, { lat: 47.61, lng: -122.33 }, { lat: 44.98, lng: -93.27 },
  { lat: 33.75, lng: -84.39 }, { lat: 25.77, lng: -80.19 }, { lat: 27.95, lng: -82.46 },
  { lat: 39.29, lng: -76.61 }, { lat: 42.36, lng: -71.06 }, { lat: 43.05, lng: -76.15 },
  { lat: 41.50, lng: -81.69 }, { lat: 45.52, lng: -122.68 }, { lat: 36.17, lng: -115.14 },
];

export async function scrapeLocally() {
  log(SOURCE, 'Starting Locally.com API scrape (Cannondale, Gazelle)...');
  let totalSaved = 0;

  for (const brand of BRANDS) {
    const seenIds = new Set();
    log(SOURCE, `Scraping ${brand.name}...`);

    for (const { lat, lng } of US_GRID) {
      await rateLimit('api.locally.com', 1200);

      const url = `https://api.locally.com/stores/search?company_id=${brand.companyId}&lat=${lat}&lng=${lng}&radius=150&limit=100`;

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)',
            'Accept': 'application/json',
            'Referer': 'https://ebikelocal.com',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          log(SOURCE, `${brand.name} API error ${res.status} at (${lat},${lng})`);
          continue;
        }

        const data = await res.json();
        const stores = data.stores || data.data || data || [];

        for (const store of (Array.isArray(stores) ? stores : [])) {
          const id = String(store.id || store.store_id || `${store.name}-${store.city}`);
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const record = normalizeLocally(store, brand);
          if (!record.name) continue;

          const saved = await stageRecord(record);
          if (saved) totalSaved++;
        }
      } catch (err) {
        log(SOURCE, `${brand.name} error at (${lat},${lng}): ${err.message}`);
      }
    }

    log(SOURCE, `${brand.name}: ${seenIds.size} unique stores found`);
    await sleep(2000);
  }

  log(SOURCE, `Total staged: ${totalSaved}`);
  return totalSaved;
}

function normalizeLocally(raw, brand) {
  const state = raw.state || raw.province || '';
  const stateCode = state.length === 2 ? state.toUpperCase() : null;

  return {
    source: `locally_${brand.slug}`,
    sourceId: raw.id ? String(raw.id) : null,
    rawData: raw,
    name: raw.name || raw.store_name || '',
    address: raw.address || raw.street || '',
    city: raw.city || '',
    state,
    stateCode,
    zip: raw.zip || raw.postal_code || '',
    latitude: raw.lat ? parseFloat(raw.lat) : null,
    longitude: raw.lng ? parseFloat(raw.lng) : null,
    phone: raw.phone || raw.telephone || '',
    website: raw.url || raw.website || '',
    email: raw.email || null,
    brandName: brand.name,
    dealerTier: raw.dealer_type || raw.type || null,
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
