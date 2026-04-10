/**
 * Velotric Dealer Scraper
 * Method: StorePoint API (direct HTTP — no browser needed)
 * Store ID: 1694b511fb7b50
 * API: api26.storepoint.co/v2/{id}/locations
 * Est. dealers: ~816
 */
import { stageRecord, rateLimit, log, sql, toStateCode } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'velotric';
const STORE_ID = '1694b511fb7b50';
const BASE = `https://api26.storepoint.co/v2/${STORE_ID}/locations`;

// US coverage grid — radius 200 miles each, ~25 nodes covers the country
const US_GRID = [
  { lat: 47.61, lng: -122.33 }, // Seattle
  { lat: 45.52, lng: -122.68 }, // Portland
  { lat: 37.77, lng: -122.42 }, // San Francisco
  { lat: 34.05, lng: -118.24 }, // Los Angeles
  { lat: 32.72, lng: -117.16 }, // San Diego
  { lat: 33.45, lng: -112.07 }, // Phoenix
  { lat: 36.17, lng: -115.14 }, // Las Vegas
  { lat: 39.74, lng: -104.98 }, // Denver
  { lat: 35.08, lng: -106.65 }, // Albuquerque
  { lat: 41.85, lng: -87.65 }, // Chicago
  { lat: 44.98, lng: -93.27 }, // Minneapolis
  { lat: 39.10, lng: -94.58 }, // Kansas City
  { lat: 38.63, lng: -90.20 }, // St. Louis
  { lat: 41.50, lng: -81.69 }, // Cleveland
  { lat: 42.33, lng: -83.05 }, // Detroit
  { lat: 39.10, lng: -84.51 }, // Cincinnati
  { lat: 33.75, lng: -84.39 }, // Atlanta
  { lat: 25.77, lng: -80.19 }, // Miami
  { lat: 27.95, lng: -82.46 }, // Tampa
  { lat: 29.76, lng: -95.37 }, // Houston
  { lat: 30.27, lng: -97.74 }, // Austin
  { lat: 32.79, lng: -96.80 }, // Dallas
  { lat: 35.47, lng: -97.52 }, // Oklahoma City
  { lat: 36.17, lng: -86.78 }, // Nashville
  { lat: 35.23, lng: -80.84 }, // Charlotte
  { lat: 40.71, lng: -74.01 }, // New York
  { lat: 42.36, lng: -71.06 }, // Boston
  { lat: 39.95, lng: -75.17 }, // Philadelphia
  { lat: 38.91, lng: -77.04 }, // Washington DC
  { lat: 43.62, lng: -116.20 }, // Boise
  { lat: 39.53, lng: -119.81 }, // Reno
  { lat: 43.05, lng: -76.15 }, // Syracuse
  { lat: 30.33, lng: -81.66 }, // Jacksonville
  { lat: 29.95, lng: -90.07 }, // New Orleans
];

export async function scrapeVelotric() {
  log(SOURCE, 'Starting Velotric dealer scrape via StorePoint API...');

  // StorePoint returns ALL locations when no lat/long provided
  await rateLimit('api26.storepoint.co', 500);
  const res = await fetch(BASE, {
    headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`StorePoint API error: ${res.status}`);
  const data = await res.json();
  const locations = data.results?.locations || [];
  log(SOURCE, `Fetched ${locations.length} total Velotric locations`);

  let totalSaved = 0;
  for (const loc of locations) {
    const record = normalizeStorePoint(loc);
    // Filter to US only
    const parts = (loc.streetaddress || '').split(',');
    if (parts[4]?.trim() && !parts[4].trim().includes('United States')) continue;
    if (!record.name || !record.stateCode) continue;

    const saved = await stageRecord(record);
    if (saved) totalSaved++;
  }

  log(SOURCE, `Staged ${totalSaved} Velotric dealers.`);
  return totalSaved;
}

function normalizeStorePoint(raw) {
  // streetaddress format: "street,city,state,zip,country"
  const parts = (raw.streetaddress || '').split(',').map(s => s.trim());
  const address = parts[0] || '';
  const city = parts[1] || '';
  const state = parts[2] || '';
  const zip = parts[3] || '';

  // Tags include model info and service types
  const tags = (raw.tags || '').toLowerCase();
  const isShowcase = tags.includes('showcase') || raw.name?.toLowerCase().includes('showcase');

  // Parse website from custom_fields JSON
  let website = raw.website || '';
  if (!website && raw.custom_fields) {
    try {
      const cf = JSON.parse(raw.custom_fields);
      website = Object.values(cf)[0] || '';
    } catch { /* skip */ }
  }

  return {
    source: SOURCE,
    sourceId: String(raw.id || ''),
    rawData: raw,
    name: raw.name || '',
    address,
    city,
    state,
    stateCode: toStateCode(state),
    zip,
    latitude: raw.loc_lat ? parseFloat(raw.loc_lat) : null,
    longitude: raw.loc_long ? parseFloat(raw.loc_long) : null,
    phone: raw.phone || '',
    website,
    email: raw.email || null,
    brandName: 'Velotric',
    dealerTier: isShowcase ? 'showcase' : 'authorized',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeVelotric().then(n => {
    console.log(`\nVelotric scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Velotric scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
