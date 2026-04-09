/**
 * Giant Bicycles Store Finder Scraper
 * URL: giant-bicycles.com/us/stores
 * Method: Playwright — intercept API calls, capture capability badges
 * Est. dealers: ~1,224 US locations
 */
import { launchBrowser, newPage, stageRecord, rateLimit, log, sql, sleep } from './utils.mjs';

const SOURCE = 'giant';
const LOCATOR_URL = 'https://www.giant-bicycles.com/us/stores';

export async function scrapeGiant() {
  log(SOURCE, 'Starting Giant store finder scrape...');
  const browser = await launchBrowser();
  const stores = [];
  const seenIds = new Set();
  let totalSaved = 0;

  try {
    const page = await newPage(browser);

    page.on('response', async (response) => {
      const url = response.url();
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      if (!url.includes('store') && !url.includes('dealer') && !url.includes('location') && !url.includes('giant')) return;

      try {
        const data = await response.json();
        const records = Array.isArray(data) ? data
          : data.stores || data.dealers || data.locations || data.data?.stores || [];
        if (records.length) {
          log(SOURCE, `Captured ${records.length} stores from: ${url}`);
          stores.push(...records);
        }
      } catch { /* skip */ }
    });

    await rateLimit('giant-bicycles.com', 2000);
    await page.goto(LOCATOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(5000);

    // Giant has a country-wide view option — try to load all US stores
    // Check for "list view" or "show all" button
    const showAllBtn = page.locator('button:has-text("All"), button:has-text("List"), [data-view="list"]').first();
    if (await showAllBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showAllBtn.click();
      await sleep(3000);
    }

    // Search major metros
    const zips = ['10001', '90210', '60601', '77001', '85001', '19101', '98101', '80201', '02101', '30301'];
    const input = page.locator('input[type="text"], input[type="search"]').first();

    for (const zip of zips) {
      await rateLimit('giant-bicycles.com', 2000);
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.click({ clickCount: 3 });
        await input.fill(zip);
        await input.press('Enter');
        await sleep(3000);
      }
    }

    // Deduplicate and stage
    for (const store of stores) {
      const id = String(store.id || store.storeId || `${store.name}-${store.city}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const record = normalizeGiant(store);
      if (!record.name) continue;

      const saved = await stageRecord(record);
      if (saved) totalSaved++;
    }

    log(SOURCE, `Staged ${totalSaved} Giant stores.`);
  } finally {
    await browser.close();
    await sql.end();
  }

  return totalSaved;
}

function normalizeGiant(raw) {
  const state = raw.state || raw.stateProvince || raw.region || '';
  const stateCode = state.length === 2 ? state.toUpperCase() : null;

  // Giant's capability badges
  const capabilities = raw.capabilities || raw.features || raw.badges || [];
  const services = [];
  if (capabilities.some(c => String(c).toLowerCase().includes('ebike') || String(c).toLowerCase().includes('electric'))) services.push('sales');
  if (capabilities.some(c => String(c).toLowerCase().includes('service') || String(c).toLowerCase().includes('repair'))) services.push('repair');
  if (capabilities.some(c => String(c).toLowerCase().includes('rental') || String(c).toLowerCase().includes('rent'))) services.push('rental');
  if (capabilities.some(c => String(c).toLowerCase().includes('fitting'))) services.push('fitting');

  return {
    source: 'giant',
    sourceId: raw.id ? String(raw.id) : null,
    rawData: raw,
    name: raw.name || raw.storeName || '',
    address: raw.address || raw.address1 || raw.street || '',
    city: raw.city || '',
    state,
    stateCode,
    zip: raw.zip || raw.postalCode || '',
    latitude: raw.lat ? parseFloat(raw.lat) : null,
    longitude: raw.lng ? parseFloat(raw.lng) : null,
    phone: raw.phone || raw.telephone || '',
    website: raw.website || raw.url || '',
    email: raw.email || null,
    brandName: 'Giant',
    dealerTier: raw.tier || raw.type || null,
  };
}

scrapeGiant().then(n => {
  console.log(`\nGiant scrape complete: ${n} records staged.`);
  process.exit(0);
}).catch(err => {
  console.error('Giant scrape failed:', err);
  process.exit(1);
});
