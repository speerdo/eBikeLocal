/**
 * Giant Bicycles Store Finder Scraper
 * Method: Direct HTTP POST to /us/stores/dealers API
 * No browser needed — just Content-Type + Referer headers
 * Strategy: Two regional queries (East + West US) cover all ~1,224 stores
 */
import { stageRecord, rateLimit, log, sql } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'giant';
const API_URL = 'https://www.giant-bicycles.com/us/stores/dealers';

const REGIONS = [
  {
    name: 'Eastern US',
    lat: 40.71, lng: -74.01, keyword: 'New York',
    NE_lat: 47, NE_lng: -65, SW_lat: 25, SW_lng: -90,
  },
  {
    name: 'Western US',
    lat: 39.74, lng: -104.98, keyword: 'Denver',
    NE_lat: 50, NE_lng: -85, SW_lat: 24, SW_lng: -125,
  },
];

async function searchRegion(region) {
  const body = {
    latitude: region.lat,
    longitude: region.lng,
    keyword: region.keyword,
    NE_lat: region.NE_lat,
    NE_lng: region.NE_lng,
    SW_lat: region.SW_lat,
    SW_lng: region.SW_lng,
    campaigncodes: [],
    onlyGiantStores: false,
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.giant-bicycles.com/us/stores',
      'request-context': 'appId=cid-v1:bcbdd0de-c1e2-42db-800f-95f4bbafeac3',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.dealers || [];
}

export async function scrapeGiant() {
  log(SOURCE, 'Starting Giant store scrape via direct HTTP API...');

  const seenIds = new Set();
  let totalSaved = 0;

  for (const region of REGIONS) {
    await rateLimit('www.giant-bicycles.com', 2000);
    try {
      const dealers = await searchRegion(region);
      log(SOURCE, `${region.name}: ${dealers.length} dealers`);

      for (const dealer of dealers) {
        const id = String(dealer.Id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const record = normalizeGiant(dealer);
        if (!record.name || !record.stateCode) continue;

        const saved = await stageRecord(record);
        if (saved) totalSaved++;
      }
    } catch (err) {
      log(SOURCE, `Error for ${region.name}: ${err.message}`);
    }
  }

  log(SOURCE, `Staged ${totalSaved} Giant stores (${seenIds.size} unique found).`);
  return totalSaved;
}

function normalizeGiant(raw) {
  // AddressLocalized: "590 W. 45th Street, New York,  NY  10036"
  const addrStr = raw.AddressLocalized || '';
  const addrParts = addrStr.split(',').map(s => s.trim());

  const address = addrParts[0] || '';
  const city = addrParts[1] || '';
  const stateZip = addrParts[2] || '';
  const stateMatch = stateZip.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)?/);
  const state = stateMatch ? stateMatch[1] : '';
  const zip = stateMatch ? (stateMatch[2] || '').split('-')[0] : '';

  const isGiantStore = raw.IsGiantStore || false;

  return {
    source: SOURCE,
    sourceId: raw.Id ? String(raw.Id) : null,
    rawData: raw,
    name: raw.Name || '',
    address,
    city,
    state,
    stateCode: state.length === 2 ? state : null,
    zip,
    latitude: raw.Latitude ? parseFloat(raw.Latitude) : null,
    longitude: raw.Longitude ? parseFloat(raw.Longitude) : null,
    phone: raw.Phone || '',
    website: raw.WebAdd || raw.WebSite || '',
    email: raw.Email || null,
    brandName: 'Giant',
    dealerTier: isGiantStore ? 'giant_store' : 'authorized',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeGiant().then(n => {
    console.log(`\nGiant scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Giant scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
