/**
 * Aventon Dealer Locator Scraper
 * Method: Beeline Connect API (direct HTTP — no browser needed)
 * API: cdn.brand-api.beelineconnect.com
 * API key: public, embedded in dealer locator page
 * Est. dealers: ~1,200
 */
import { stageRecord, rateLimit, log, sql } from './utils.mjs';
import { fileURLToPath } from 'url';

const SOURCE = 'aventon';
const API_KEY = 'PqXmqO494jBCn90Z2J3FLMdkwnW2C0duJL9fa1k0DmA';
const BASE = 'https://cdn.brand-api.beelineconnect.com/api/v1/locator';

export async function scrapeAventon() {
  log(SOURCE, 'Starting Aventon dealer scrape via Beeline Connect API...');

  // Step 1: Get all 1,202 shop points (coords + tags + postal_code)
  await rateLimit('cdn.brand-api.beelineconnect.com', 500);
  const pointsRes = await fetch(`${BASE}/points?limit=0&tags=&api_key=${API_KEY}`, {
    headers: { 'User-Agent': 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)' },
    signal: AbortSignal.timeout(30000),
  });

  if (!pointsRes.ok) throw new Error(`Points API error: ${pointsRes.status}`);
  const pointsData = await pointsRes.json();
  const points = pointsData.locator_shop_points || [];
  log(SOURCE, `Fetched ${points.length} shop points`);

  // Step 2: Group by postal code, pick one representative lat/lng per zip
  const zipToPoint = new Map();
  for (const p of points) {
    if (!p.postal_code) continue;
    if (!zipToPoint.has(p.postal_code)) {
      zipToPoint.set(p.postal_code, p);
    }
  }
  log(SOURCE, `${zipToPoint.size} unique postal codes to query`);

  // Step 3: For each zip, call search endpoint to get full shop details
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

        const record = normalizeBeeline(shop, 'Aventon');
        if (!record.name || !record.stateCode) continue;

        const saved = await stageRecord(record);
        if (saved) totalSaved++;
      }
    } catch (err) {
      log(SOURCE, `Error for zip ${zip}: ${err.message}`);
    }
  }

  log(SOURCE, `Staged ${totalSaved} Aventon dealers (${seenIds.size} unique found).`);
  return totalSaved;
}

export function normalizeBeeline(raw, brandName) {
  const addr = raw.physical_address || raw.shipping_address || {};
  const geo = raw.geolocation || {};
  const state = addr.state || '';

  // Dealer tier from tags
  const tags = raw.tags || [];
  const tier = tags.includes('signature_dealer') ? 'signature'
    : tags.includes('elite_dealer') ? 'elite'
    : tags.includes('stocking_dealer') ? 'stocking'
    : 'authorized';

  return {
    source: SOURCE,
    sourceId: raw.shop_key || String(raw.id || raw.shop_id || ''),
    rawData: raw,
    name: raw.name || '',
    address: addr.address1 || '',
    city: addr.city || '',
    state,
    stateCode: state.length === 2 ? state.toUpperCase() : null,
    zip: addr.zip || addr.postal_code || '',
    latitude: geo.latitude ? parseFloat(geo.latitude) : null,
    longitude: geo.longitude ? parseFloat(geo.longitude) : null,
    phone: raw.phone || '',
    website: raw.website_url || '',
    email: raw.email || null,
    brandName,
    dealerTier: tier,
  };
}

// Run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeAventon().then(n => {
    console.log(`\nAventon scrape complete: ${n} records staged.`);
    sql.end();
    process.exit(0);
  }).catch(err => {
    console.error('Aventon scrape failed:', err);
    sql.end();
    process.exit(1);
  });
}
