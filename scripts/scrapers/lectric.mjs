/**
 * Lectric eBikes Dealer Scraper
 * Method: Stockist API (public JSON endpoint)
 * Endpoint: app.stockist.co/api/v1/{tag}/locations/search
 * Est. dealers: 500+
 */
import { stageRecord, rateLimit, log, sql, sleep } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'lectric';
const BRAND = 'Lectric eBikes';

// Grid of US metro coordinates to sweep for dealers
// Stockist returns results within radius, so we need to grid the country
const US_GRID = [
  // West Coast
  { lat: 47.61, lng: -122.33 }, // Seattle
  { lat: 45.52, lng: -122.68 }, // Portland
  { lat: 37.77, lng: -122.42 }, // San Francisco
  { lat: 34.05, lng: -118.24 }, // Los Angeles
  { lat: 32.72, lng: -117.16 }, // San Diego
  { lat: 33.45, lng: -112.07 }, // Phoenix
  { lat: 36.17, lng: -115.14 }, // Las Vegas
  { lat: 39.74, lng: -104.98 }, // Denver
  { lat: 35.08, lng: -106.65 }, // Albuquerque
  // Midwest
  { lat: 41.85, lng: -87.65 }, // Chicago
  { lat: 44.98, lng: -93.27 }, // Minneapolis
  { lat: 39.10, lng: -94.58 }, // Kansas City
  { lat: 38.63, lng: -90.20 }, // St. Louis
  { lat: 43.05, lng: -76.15 }, // Syracuse
  { lat: 41.50, lng: -81.69 }, // Cleveland
  { lat: 42.33, lng: -83.05 }, // Detroit
  { lat: 39.96, lng: -82.99 }, // Columbus
  { lat: 39.10, lng: -84.51 }, // Cincinnati
  // South
  { lat: 33.75, lng: -84.39 }, // Atlanta
  { lat: 30.33, lng: -81.66 }, // Jacksonville
  { lat: 25.77, lng: -80.19 }, // Miami
  { lat: 27.95, lng: -82.46 }, // Tampa
  { lat: 29.76, lng: -95.37 }, // Houston
  { lat: 30.27, lng: -97.74 }, // Austin
  { lat: 32.79, lng: -96.80 }, // Dallas
  { lat: 29.95, lng: -90.07 }, // New Orleans
  { lat: 35.47, lng: -97.52 }, // Oklahoma City
  { lat: 36.17, lng: -86.78 }, // Nashville
  { lat: 35.15, lng: -90.05 }, // Memphis
  { lat: 35.23, lng: -80.84 }, // Charlotte
  // Northeast
  { lat: 40.71, lng: -74.01 }, // New York
  { lat: 42.36, lng: -71.06 }, // Boston
  { lat: 39.95, lng: -75.17 }, // Philadelphia
  { lat: 38.91, lng: -77.04 }, // Washington DC
  { lat: 39.29, lng: -76.61 }, // Baltimore
  { lat: 41.76, lng: -72.68 }, // Hartford
  { lat: 43.66, lng: -70.26 }, // Portland ME
  { lat: 42.65, lng: -73.75 }, // Albany
  // Northwest/Mountain
  { lat: 43.62, lng: -116.20 }, // Boise
  { lat: 46.60, lng: -112.03 }, // Helena
  { lat: 47.50, lng: -111.30 }, // Great Falls
  { lat: 44.06, lng: -121.31 }, // Bend OR
];

export async function scrapeLectric() {
  log(SOURCE, 'Starting Lectric eBikes dealer scrape via Stockist API...');

  // First, discover the Stockist store tag for Lectric
  // Try to find it from the store locator page
  let storeTag = 'lectric-ebikes'; // common pattern — adjust if needed
  let totalSaved = 0;
  const seenIds = new Set();

  for (const { lat, lng } of US_GRID) {
    await rateLimit('app.stockist.co');

    const url = `https://app.stockist.co/api/v1/${storeTag}/locations/search?lat=${lat}&lng=${lng}&distance=150`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        if (res.status === 404) {
          log(SOURCE, `Store tag '${storeTag}' not found — try discovering it from the page`);
          break;
        }
        continue;
      }

      const data = await res.json();
      const locations = data.locations || data || [];

      for (const loc of locations) {
        const id = String(loc.id || `${loc.name}-${loc.city}`);
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const saved = await stageRecord(normalizeLectric(loc));
        if (saved) totalSaved++;
      }

      log(SOURCE, `Grid (${lat.toFixed(1)},${lng.toFixed(1)}): +${locations.length} locations. Total: ${seenIds.size}`);
    } catch (err) {
      log(SOURCE, `Error at (${lat},${lng}): ${err.message}`);
    }
  }

  log(SOURCE, `Staged ${totalSaved} Lectric dealers.`);
  return totalSaved;
}

function normalizeLectric(raw) {
  return {
    source: 'lectric',
    sourceId: raw.id ? String(raw.id) : null,
    rawData: raw,
    name: raw.name || '',
    address: raw.address || raw.address_line_1 || '',
    city: raw.city || '',
    state: raw.state || raw.province || '',
    stateCode: (raw.state || raw.province || '').length === 2
      ? (raw.state || raw.province).toUpperCase()
      : null,
    zip: raw.zip_code || raw.postal_code || '',
    latitude: raw.lat ? parseFloat(raw.lat) : null,
    longitude: raw.lng ? parseFloat(raw.lng) : null,
    phone: raw.phone || '',
    website: raw.url || raw.website || '',
    email: raw.email || null,
    brandName: BRAND,
    dealerTier: raw.tags?.includes('Test Ride') ? 'test_ride'
      : raw.tags?.includes('Retail') ? 'retail'
      : raw.tags?.includes('Rent') ? 'rental'
      : null,
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
