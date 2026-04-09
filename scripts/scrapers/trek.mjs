/**
 * Trek Store Finder Scraper
 * URL: trekbikes.com/us/en_US/store-finder/
 * Method: Playwright — intercept Vue.js SPA internal REST API calls
 * Est. dealers: 1,500–2,000+
 */
import { launchBrowser, newPage, stageRecord, rateLimit, log, sql, sleep } from './utils.mjs';

const SOURCE = 'trek';
const LOCATOR_URL = 'https://www.trekbikes.com/us/en_US/store-finder/';

export async function scrapeTrek() {
  log(SOURCE, 'Starting Trek store finder scrape...');
  const browser = await launchBrowser();
  const stores = [];
  const seenIds = new Set();
  let totalSaved = 0;

  try {
    const page = await newPage(browser);

    // Capture API responses from Trek's internal store-finder REST API
    page.on('response', async (response) => {
      const url = response.url();
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      if (!url.includes('store') && !url.includes('dealer') && !url.includes('retailer') && !url.includes('location')) return;
      if (url.includes('trekbikes.com')) {
        try {
          const data = await response.json();
          const records = Array.isArray(data) ? data
            : data.stores || data.retailers || data.dealers || data.results || data.data || [];
          if (records.length) {
            log(SOURCE, `Captured ${records.length} stores from API: ${url}`);
            stores.push(...records);
          }
        } catch { /* skip */ }
      }
    });

    await rateLimit('trekbikes.com', 2000);
    await page.goto(LOCATOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);

    // Try searching major US metros to trigger API calls for different regions
    const metros = [
      'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX',
      'Phoenix, AZ', 'Philadelphia, PA', 'San Antonio, TX', 'San Diego, CA',
      'Dallas, TX', 'San Jose, CA', 'Austin, TX', 'Jacksonville, FL',
      'Seattle, WA', 'Denver, CO', 'Boston, MA', 'Portland, OR',
      'Atlanta, GA', 'Miami, FL', 'Minneapolis, MN', 'Cleveland, OH',
    ];

    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="city"], input[placeholder*="zip"]').first();

    for (const metro of metros) {
      await rateLimit('trekbikes.com', 1500);
      try {
        if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await searchInput.triple_click?.() || await searchInput.click({ clickCount: 3 });
          await searchInput.fill(metro);
          await searchInput.press('Enter');
          await sleep(3000);
        }
      } catch (err) {
        log(SOURCE, `Metro search error (${metro}): ${err.message}`);
      }
    }

    // Deduplicate and stage
    for (const store of stores) {
      const id = String(store.id || store.storeId || store.retailerId || `${store.name}-${store.city}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const record = normalizeTrek(store);
      if (!record.name || !record.stateCode) continue;

      const saved = await stageRecord(record);
      if (saved) totalSaved++;
    }

    log(SOURCE, `Staged ${totalSaved} Trek stores.`);
  } finally {
    await browser.close();
    await sql.end();
  }

  return totalSaved;
}

function normalizeTrek(raw) {
  const addr = raw.address || raw.addressLine1 || raw.street || '';
  const city = raw.city || raw.addressCity || '';
  const state = raw.state || raw.addressState || raw.stateProvince || '';
  const stateCode = state.length === 2 ? state.toUpperCase() : null;

  return {
    source: 'trek',
    sourceId: raw.id ? String(raw.id) : raw.storeId ? String(raw.storeId) : null,
    rawData: raw,
    name: raw.name || raw.storeName || raw.retailerName || '',
    address: addr,
    city,
    state,
    stateCode,
    zip: raw.zip || raw.postalCode || raw.zipCode || '',
    latitude: raw.lat ? parseFloat(raw.lat) : raw.latitude ? parseFloat(raw.latitude) : null,
    longitude: raw.lng ? parseFloat(raw.lng) : raw.longitude ? parseFloat(raw.longitude) : null,
    phone: raw.phone || raw.telephone || '',
    website: raw.website || raw.url || '',
    email: raw.email || null,
    brandName: 'Trek',
    dealerTier: raw.type || raw.dealerType || raw.tier || null,
  };
}

scrapeTrek().then(n => {
  console.log(`\nTrek scrape complete: ${n} records staged.`);
  process.exit(0);
}).catch(err => {
  console.error('Trek scrape failed:', err);
  process.exit(1);
});
