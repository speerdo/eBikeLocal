/**
 * Specialized Store Finder Scraper
 * URL: specialized.com/us/en/store-finder
 * Method: Playwright — intercept Amplience CMS API calls
 * Est. dealers: 1,000+
 */
import { launchBrowser, newPage, stageRecord, rateLimit, log, sql, sleep } from './utils.mjs';

const SOURCE = 'specialized';
const LOCATOR_URL = 'https://www.specialized.com/us/en/store-finder';

export async function scrapeSpecialized() {
  log(SOURCE, 'Starting Specialized store finder scrape...');
  const browser = await launchBrowser();
  const stores = [];
  const seenIds = new Set();
  let totalSaved = 0;

  try {
    const page = await newPage(browser);

    // Intercept Amplience CMS and any store API responses
    page.on('response', async (response) => {
      const url = response.url();
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;

      const isRelevant =
        url.includes('specialized') ||
        url.includes('amplience') ||
        url.includes('store') ||
        url.includes('dealer') ||
        url.includes('location');

      if (!isRelevant) return;

      try {
        const data = await response.json();

        // Amplience CMS often wraps in a content/results structure
        const records =
          Array.isArray(data) ? data :
          data.stores || data.dealers || data.locations ||
          data.content?.stores || data.results || data.data || [];

        if (Array.isArray(records) && records.length > 0) {
          log(SOURCE, `Captured ${records.length} from ${url.slice(0, 80)}`);
          stores.push(...records);
        }
      } catch { /* skip */ }
    });

    await rateLimit('specialized.com', 2000);
    await page.goto(LOCATOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(5000);

    // Try store feature filters to trigger additional API calls
    const filterBtns = page.locator('[data-filter], [class*="filter"] button, button:has-text("E-Bike")');
    const filterCount = await filterBtns.count();
    for (let i = 0; i < Math.min(filterCount, 5); i++) {
      try {
        await filterBtns.nth(i).click();
        await sleep(2000);
      } catch { /* skip */ }
    }

    // Search major metros
    const metros = ['10001', '90210', '60601', '77001', '85001', '98101', '80201', '30301', '33101', '75201'];
    const input = page.locator('input[type="text"], input[type="search"], input[placeholder*="zip"], input[placeholder*="city"]').first();

    for (const zip of metros) {
      await rateLimit('specialized.com', 2000);
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.click({ clickCount: 3 });
        await input.fill(zip);
        await input.press('Enter');
        await sleep(3000);
      }
    }

    // Deduplicate and stage
    for (const store of stores) {
      const id = String(store.id || store.storeId || store.externalId || `${store.name}-${store.city}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const record = normalizeSpecialized(store);
      if (!record.name || !record.stateCode) continue;

      const saved = await stageRecord(record);
      if (saved) totalSaved++;
    }

    log(SOURCE, `Staged ${totalSaved} Specialized stores.`);
  } finally {
    await browser.close();
    await sql.end();
  }

  return totalSaved;
}

function normalizeSpecialized(raw) {
  const state = raw.state || raw.stateProvince || raw.addressRegion || raw.region || '';
  const stateCode = state.length === 2 ? state.toUpperCase() : null;

  const features = raw.features || raw.storeFeatures || raw.capabilities || [];
  const services = [];
  if (features.some((f: string) => /ebike|electric/i.test(String(f)))) services.push('sales');
  if (features.some((f: string) => /service|repair/i.test(String(f)))) services.push('repair');
  if (features.some((f: string) => /rental|rent/i.test(String(f)))) services.push('rental');

  return {
    source: 'specialized',
    sourceId: raw.id ? String(raw.id) : raw.externalId ? String(raw.externalId) : null,
    rawData: raw,
    name: raw.name || raw.storeName || '',
    address: raw.address || raw.addressLine1 || raw.street || '',
    city: raw.city || raw.addressCity || '',
    state,
    stateCode,
    zip: raw.zip || raw.postalCode || raw.zipCode || '',
    latitude: raw.lat ? parseFloat(raw.lat) : raw.latitude ? parseFloat(raw.latitude) : null,
    longitude: raw.lng ? parseFloat(raw.lng) : raw.longitude ? parseFloat(raw.longitude) : null,
    phone: raw.phone || raw.telephone || '',
    website: raw.website || raw.url || '',
    email: raw.email || null,
    brandName: 'Specialized',
    dealerTier: raw.type || raw.tier || null,
  };
}

scrapeSpecialized().then(n => {
  console.log(`\nSpecialized scrape complete: ${n} records staged.`);
  process.exit(0);
}).catch(err => {
  console.error('Specialized scrape failed:', err);
  process.exit(1);
});
