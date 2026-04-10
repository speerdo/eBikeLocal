/**
 * Specialized Store Finder Scraper
 * Method: Yext GraphQL API (direct HTTP — no browser needed)
 * Endpoint: www.specialized.com/api/graphql
 * Strategy: Grid of US metros with radius=150 miles, paginate with offset
 * Est. dealers: 1,000+
 */
import { stageRecord, rateLimit, log, sql } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'specialized';
const GRAPHQL_URL = 'https://www.specialized.com/api/graphql';

const GQL_QUERY = `
  query getYextGeoSearch(
    $location: String!
    $limit: String
    $radius: String
    $fieldList: String
    $filter: [String]
    $offset: String
  ) {
    getYextGeoSearch(
      location: $location
      limit: $limit
      fieldList: $fieldList
      filter: $filter
      radius: $radius
      offset: $offset
    ) {
      response {
        count
        stores {
          name
          address { line1 city region postalCode countryCode }
          mainPhone
          meta { id }
          c_IsActive
          featuresArray { featureDisplayTitle isAvailable }
        }
      }
    }
  }
`;

// US coverage grid with radius=150 miles
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
  { lat: 35.15, lng: -90.05 }, // Memphis
  { lat: 35.23, lng: -80.84 }, // Charlotte
  { lat: 40.71, lng: -74.01 }, // New York
  { lat: 42.36, lng: -71.06 }, // Boston
  { lat: 39.95, lng: -75.17 }, // Philadelphia
  { lat: 38.91, lng: -77.04 }, // Washington DC
  { lat: 39.29, lng: -76.61 }, // Baltimore
  { lat: 43.62, lng: -116.20 }, // Boise
  { lat: 39.53, lng: -119.81 }, // Reno
  { lat: 43.05, lng: -76.15 }, // Syracuse
  { lat: 30.33, lng: -81.66 }, // Jacksonville
  { lat: 29.95, lng: -90.07 }, // New Orleans
  { lat: 43.00, lng: -88.00 }, // Milwaukee
  { lat: 39.96, lng: -82.99 }, // Columbus
  { lat: 36.17, lng: -115.14 }, // Las Vegas (extra)
  { lat: 46.60, lng: -112.03 }, // Helena
  { lat: 44.06, lng: -121.31 }, // Bend OR
  { lat: 43.66, lng: -70.26 }, // Portland ME
  { lat: 42.65, lng: -73.75 }, // Albany
];

async function searchStores(location, offset = 0, radius = '150') {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-apollo-operation-name': 'getYextGeoSearch',
      'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)',
    },
    body: JSON.stringify({
      operationName: 'getYextGeoSearch',
      variables: {
        location,
        limit: '50',
        radius,
        offset: String(offset),
      },
      query: GQL_QUERY,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data?.data?.getYextGeoSearch?.response || null;
}

export async function scrapeSpecialized() {
  log(SOURCE, 'Starting Specialized store scrape via Yext GraphQL API...');

  const seenIds = new Set();
  let totalSaved = 0;

  for (const { lat, lng } of US_GRID) {
    await rateLimit('www.specialized.com', 1000);

    const location = `${lat},${lng}`;
    let offset = 0;

    try {
      let response = await searchStores(location, offset);
      if (!response) continue;

      const total = response.count || 0;

      while (offset < total) {
        if (offset > 0) {
          await rateLimit('www.specialized.com', 800);
          response = await searchStores(location, offset);
          if (!response) break;
        }

        const stores = response.stores || [];
        for (const store of stores) {
          const id = store.meta?.id;
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);

          // Skip inactive stores
          if (store.c_IsActive === false) continue;
          // US only
          if (store.address?.countryCode && store.address.countryCode !== 'US') continue;

          const record = normalizeSpecialized(store);
          if (!record.name || !record.stateCode) continue;

          const saved = await stageRecord(record);
          if (saved) totalSaved++;
        }

        offset += stores.length || 50;
        if (stores.length < 50) break;
      }
    } catch (err) {
      log(SOURCE, `Error at (${lat},${lng}): ${err.message}`);
    }
  }

  log(SOURCE, `Staged ${totalSaved} Specialized stores (${seenIds.size} unique found).`);
  return totalSaved;
}

function normalizeSpecialized(raw) {
  const addr = raw.address || {};
  const state = addr.region || '';

  // Features
  const features = raw.featuresArray || [];
  const activeFeatures = features.filter(f => f.isAvailable).map(f => f.featureDisplayTitle || '');
  const tier = activeFeatures.some(f => /premier|flagship/i.test(f)) ? 'premier' : 'authorized';

  return {
    source: SOURCE,
    sourceId: raw.meta?.id || null,
    rawData: raw,
    name: raw.name || '',
    address: addr.line1 || '',
    city: addr.city || '',
    state,
    stateCode: state.length === 2 ? state.toUpperCase() : null,
    zip: addr.postalCode || '',
    latitude: null,
    longitude: null,
    phone: raw.mainPhone || '',
    website: '',
    email: null,
    brandName: 'Specialized',
    dealerTier: tier,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeSpecialized().then(n => {
    console.log(`\nSpecialized scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Specialized scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
