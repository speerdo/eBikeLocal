/**
 * Rad Power Bikes Dealer Scraper
 * Method: Beeline Connect API (direct HTTP — no browser needed)
 * Note: Rad filed Chapter 11 in Dec 2025, acquired by Life EV. Site is operational.
 * API key: thQlvPlW0vsP254YgdOvCG5A2LXuNTYhD0u2rKdk0wc
 * Est. dealers: ~1,263
 */
import { stageRecord, rateLimit, log, sql } from './utils.mjs';
import { normalizeBeeline } from './aventon.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'rad';
const API_KEY = 'thQlvPlW0vsP254YgdOvCG5A2LXuNTYhD0u2rKdk0wc';
const BASE = 'https://cdn.brand-api.beelineconnect.com/api/v1/locator';

export async function scrapeRad() {
  log(SOURCE, 'Starting Rad Power Bikes dealer scrape via Beeline Connect API...');
  log(SOURCE, 'Note: Rad filed Chapter 11 in Dec 2025, acquired by Life EV. Records flagged.');

  // Step 1: Get all shop points
  await rateLimit('cdn.brand-api.beelineconnect.com', 500);
  const pointsRes = await fetch(`${BASE}/points?limit=0&tags=&api_key=${API_KEY}`, {
    headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
    signal: AbortSignal.timeout(30000),
  });

  if (!pointsRes.ok) throw new Error(`Points API error: ${pointsRes.status}`);
  const pointsData = await pointsRes.json();
  const points = pointsData.locator_shop_points || [];
  log(SOURCE, `Fetched ${points.length} Rad shop points`);

  // Step 2: Group by postal code
  const zipToPoint = new Map();
  for (const p of points) {
    if (!p.postal_code) continue;
    if (!zipToPoint.has(p.postal_code)) zipToPoint.set(p.postal_code, p);
  }

  // Step 3: Search each zip for full shop details
  const seenIds = new Set();
  let totalSaved = 0;

  for (const [zip, point] of zipToPoint) {
    await rateLimit('cdn.brand-api.beelineconnect.com', 600);
    const { latitude, longitude } = point.geolocation;

    try {
      const res = await fetch(
        `${BASE}/search?latitude=${latitude}&longitude=${longitude}&radius=10&tags=&api_key=${API_KEY}`,
        {
          headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!res.ok) continue;
      const data = await res.json();
      const shops = data.locator_shops || [];

      for (const shop of shops) {
        const id = String(shop.id || shop.shop_id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const base = normalizeBeeline(shop, 'Rad Power Bikes');
        const record = {
          ...base,
          source: SOURCE,
          rawData: { ...shop, _note: 'rad_life_ev_acquisition_2026' },
        };
        if (!record.name || !record.stateCode) continue;

        const saved = await stageRecord(record);
        if (saved) totalSaved++;
      }
    } catch (err) {
      log(SOURCE, `Error for zip ${zip}: ${err.message}`);
    }
  }

  log(SOURCE, `Staged ${totalSaved} Rad Power Bikes locations.`);
  return totalSaved;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeRad().then(n => {
    console.log(`\nRad scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Rad scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
