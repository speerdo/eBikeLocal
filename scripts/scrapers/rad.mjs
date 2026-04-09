/**
 * Rad Power Bikes Scraper
 * URL: radpowerbikes.com/pages/locations
 * Method: Playwright — JS-rendered page
 * NOTE: Rad filed Chapter 11 in Dec 2025 and was acquired by Life EV.
 *       Dealer network status is uncertain — flag records accordingly.
 * Est. dealers: 1,200+ service partners (pre-acquisition)
 */
import { launchBrowser, newPage, stageRecord, rateLimit, log, sql, sleep } from './utils.mjs';

const SOURCE = 'rad';
const LOCATOR_URL = 'https://www.radpowerbikes.com/pages/locations';

export async function scrapeRad() {
  log(SOURCE, '⚠️  Rad Power Bikes status uncertain (Chapter 11 / Life EV acquisition). Scraping with caution...');
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
      if (!url.includes('location') && !url.includes('store') && !url.includes('dealer') && !url.includes('service')) return;

      try {
        const data = await response.json();
        const records = Array.isArray(data) ? data
          : data.locations || data.stores || data.partners || data.results || [];
        if (records.length) {
          log(SOURCE, `Captured ${records.length} records from ${url}`);
          stores.push(...records);
        }
      } catch { /* skip */ }
    });

    await rateLimit('radpowerbikes.com', 2000);

    let pageLoaded = false;
    try {
      await page.goto(LOCATOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
      pageLoaded = true;
    } catch (err) {
      log(SOURCE, `Page load error (site may be down): ${err.message}`);
    }

    if (pageLoaded) {
      await sleep(5000);

      // Try to trigger location search
      const input = page.locator('input[type="text"], input[type="search"]').first();
      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('90210');
        await input.press('Enter');
        await sleep(3000);
      }
    }

    for (const store of stores) {
      const id = String(store.id || `${store.name}-${store.city}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const record = normalizeRad(store);
      if (!record.name) continue;
      const saved = await stageRecord(record);
      if (saved) totalSaved++;
    }

    log(SOURCE, `Staged ${totalSaved} Rad Power Bikes locations (⚠️  verify operational status before publishing).`);
  } finally {
    await browser.close();
    await sql.end();
  }

  return totalSaved;
}

function normalizeRad(raw) {
  const state = raw.state || raw.province || '';
  return {
    source: 'rad',
    sourceId: raw.id ? String(raw.id) : null,
    rawData: { ...raw, _uncertainty: 'rad_acquisition_2026' },
    name: raw.name || raw.storeName || '',
    address: raw.address || raw.address1 || '',
    city: raw.city || '',
    state,
    stateCode: state.length === 2 ? state.toUpperCase() : null,
    zip: raw.zip || raw.postalCode || '',
    latitude: raw.lat ? parseFloat(raw.lat) : null,
    longitude: raw.lng ? parseFloat(raw.lng) : null,
    phone: raw.phone || '',
    website: raw.website || raw.url || '',
    email: raw.email || null,
    brandName: 'Rad Power Bikes',
    dealerTier: raw.type?.includes('RadRetail') ? 'brand_owned' : 'service_partner',
  };
}

scrapeRad().then(n => {
  console.log(`\nRad scrape complete: ${n} records staged.`);
  process.exit(0);
}).catch(err => {
  console.error('Rad scrape failed:', err);
  process.exit(1);
});
