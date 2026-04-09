/**
 * Aventon Dealer Locator Scraper
 * URL: aventon.com/pages/electric-bike-shop-dealer-locator
 * Method: Playwright — intercept XHR/fetch for JSON dealer data
 * Est. dealers: 1,800+
 */
import { launchBrowser, newPage, stageRecord, rateLimit, log, sql, sleep } from './utils.mjs';

const SOURCE = 'aventon';
const LOCATOR_URL = 'https://www.aventon.com/pages/electric-bike-shop-dealer-locator';

export async function scrapeAventon() {
  log(SOURCE, 'Starting Aventon dealer scrape...');
  const browser = await launchBrowser();
  let totalSaved = 0;

  try {
    const page = await newPage(browser);
    const dealers = [];

    // Intercept XHR/fetch responses that contain dealer JSON
    page.on('response', async (response) => {
      const url = response.url();
      // Look for store locator API calls (Shopify store locator apps often use these patterns)
      if (
        (url.includes('store-locator') || url.includes('locations') || url.includes('dealers') || url.includes('stockist')) &&
        response.headers()['content-type']?.includes('json')
      ) {
        try {
          const data = await response.json();
          const records = Array.isArray(data) ? data : data.locations || data.dealers || data.results || data.stores || [];
          if (records.length > 0) {
            log(SOURCE, `Intercepted ${records.length} records from ${url}`);
            dealers.push(...records);
          }
        } catch { /* non-JSON or already consumed */ }
      }
    });

    await rateLimit('aventon.com');
    await page.goto(LOCATOR_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Try triggering a broad search to load all dealers
    // Some locators require a search term or zip
    const searchInputs = [
      'input[placeholder*="zip"]',
      'input[placeholder*="city"]',
      'input[placeholder*="location"]',
      'input[type="search"]',
      'input[type="text"]',
    ];

    for (const selector of searchInputs) {
      const input = page.locator(selector).first();
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.fill('90210'); // Beverly Hills — triggers initial load
        await input.press('Enter');
        await sleep(3000);
        break;
      }
    }

    // Also try clicking a "Search" button
    const searchBtn = page.locator('button[type="submit"], button:has-text("Search"), button:has-text("Find")').first();
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchBtn.click();
      await sleep(3000);
    }

    await page.waitForTimeout(5000); // Wait for all XHR to complete

    log(SOURCE, `Captured ${dealers.length} raw dealer records via network intercept`);

    // Process and stage records
    for (const dealer of dealers) {
      const record = normalizeAventon(dealer);
      if (!record.name || !record.stateCode) continue;
      const saved = await stageRecord(record);
      if (saved) totalSaved++;
    }

    log(SOURCE, `Staged ${totalSaved} dealers.`);
  } finally {
    await browser.close();
    await sql.end();
  }

  return totalSaved;
}

function normalizeAventon(raw) {
  // Aventon store locator returns varied structures depending on the app version
  // Handle common patterns
  const name = raw.name || raw.store_name || raw.business_name || '';
  const address = raw.address || raw.address1 || raw.street || '';
  const city = raw.city || raw.city_locality || '';
  const state = raw.state || raw.state_province || raw.province || '';
  const zip = raw.zip || raw.zip_code || raw.postal_code || '';
  const lat = raw.lat || raw.latitude || raw.coordinates?.lat;
  const lng = raw.lng || raw.longitude || raw.coordinates?.lng;
  const phone = raw.phone || raw.telephone || '';
  const website = raw.url || raw.website || '';

  return {
    source: 'aventon',
    sourceId: raw.id ? String(raw.id) : null,
    rawData: raw,
    name,
    address,
    city,
    state,
    stateCode: state?.length === 2 ? state.toUpperCase() : null,
    zip,
    latitude: lat ? parseFloat(lat) : null,
    longitude: lng ? parseFloat(lng) : null,
    phone,
    website,
    email: raw.email || null,
    brandName: 'Aventon',
    dealerTier: raw.test_ride ? 'test_ride' : null,
  };
}

// Run directly
scrapeAventon().then(n => {
  console.log(`\nAventon scrape complete: ${n} records staged.`);
  process.exit(0);
}).catch(err => {
  console.error('Aventon scrape failed:', err);
  process.exit(1);
});
