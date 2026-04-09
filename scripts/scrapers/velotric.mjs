/**
 * Velotric Dealer Scraper
 * URL: velotricbike.com/pages/find-a-dealer
 * Method: Playwright — intercept fetch/XHR for dealer JSON
 * Est. dealers: 1,200+
 */
import { launchBrowser, newPage, stageRecord, rateLimit, log, sql, sleep } from './utils.mjs';

const SOURCE = 'velotric';
const LOCATOR_URL = 'https://www.velotricbike.com/pages/find-a-dealer';

export async function scrapeVelotric() {
  log(SOURCE, 'Starting Velotric dealer scrape...');
  const browser = await launchBrowser();
  const dealers = [];
  const seenIds = new Set();
  let totalSaved = 0;

  try {
    const page = await newPage(browser);

    page.on('response', async (response) => {
      const url = response.url();
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      if (!url.includes('dealer') && !url.includes('location') && !url.includes('store') && !url.includes('stockist')) return;

      try {
        const data = await response.json();
        const records = Array.isArray(data) ? data
          : data.locations || data.dealers || data.stores || data.results || [];
        if (records.length) {
          log(SOURCE, `Captured ${records.length} from ${url}`);
          dealers.push(...records);
        }
      } catch { /* skip */ }
    });

    await rateLimit('velotricbike.com');
    await page.goto(LOCATOR_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Trigger search to load dealer data
    const inputs = ['input[type="text"]', 'input[type="search"]', 'input[placeholder*="zip"]'];
    for (const sel of inputs) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.fill('10001');
        await el.press('Enter');
        await sleep(4000);
        break;
      }
    }

    // Also check for page-embedded JS data (some locators embed JSON in script tags)
    const scriptData = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script')];
      for (const s of scripts) {
        const text = s.textContent || '';
        // Look for embedded dealer JSON arrays
        const match = text.match(/dealers\s*=\s*(\[[\s\S]*?\]);/) ||
                      text.match(/locations\s*=\s*(\[[\s\S]*?\]);/) ||
                      text.match(/stores\s*=\s*(\[[\s\S]*?\]);/);
        if (match) {
          try { return JSON.parse(match[1]); } catch { /* skip */ }
        }
      }
      return [];
    });

    if (scriptData.length) {
      log(SOURCE, `Found ${scriptData.length} dealers in page script tags`);
      dealers.push(...scriptData);
    }

    await sleep(3000);

    for (const dealer of dealers) {
      const id = String(dealer.id || `${dealer.name}-${dealer.city}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const record = normalizeVelotric(dealer);
      if (!record.name) continue;
      const saved = await stageRecord(record);
      if (saved) totalSaved++;
    }

    log(SOURCE, `Staged ${totalSaved} Velotric dealers.`);
  } finally {
    await browser.close();
    await sql.end();
  }

  return totalSaved;
}

function normalizeVelotric(raw) {
  return {
    source: 'velotric',
    sourceId: raw.id ? String(raw.id) : null,
    rawData: raw,
    name: raw.name || raw.store_name || '',
    address: raw.address || raw.address1 || raw.street || '',
    city: raw.city || '',
    state: raw.state || raw.province || '',
    stateCode: (raw.state || raw.province || '').length === 2
      ? (raw.state || raw.province).toUpperCase() : null,
    zip: raw.zip || raw.postal_code || '',
    latitude: raw.lat ? parseFloat(raw.lat) : null,
    longitude: raw.lng ? parseFloat(raw.lng) : null,
    phone: raw.phone || '',
    website: raw.url || raw.website || '',
    email: raw.email || null,
    brandName: 'Velotric',
    dealerTier: raw.showcase_store ? 'showcase' : 'authorized',
  };
}

scrapeVelotric().then(n => {
  console.log(`\nVelotric scrape complete: ${n} records staged.`);
  process.exit(0);
}).catch(err => {
  console.error('Velotric scrape failed:', err);
  process.exit(1);
});
