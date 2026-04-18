/**
 * Shared fetch helpers for audit-bikes.mjs + discover-bikes.mjs.
 *
 * Many brand storefronts (Lectric, Velotric, Rad Power, Pedego, Himiway,
 * QuietKat, Specialized) block plain `fetch` from Node with Cloudflare
 * challenges. Loading the URL in a real browser (Playwright Chromium) bypasses
 * that. We only pay the browser cost on fallback.
 *
 * Requires: npx playwright install chromium
 */

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

function stripHtml(h) {
  return String(h || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strict filter: return true only if a Shopify product is plausibly a complete
 *  e-bike (not an accessory, part, bundle, drone, or battery kit). */
export function isShopifyEbikeProduct(p) {
  const title = stripHtml(p.title || '').toLowerCase();
  const type = String(p.product_type || '').toLowerCase();
  const handle = String(p.handle || '').toLowerCase();
  const blob = `${title} ${type} ${handle}`;
  const price = parseFloat(p.variants?.[0]?.price || '0');
  if (price < 700) return false;

  // Accessories / parts / consumables
  if (
    /\b(rack|kickstand|fender|battery|charger|cover|helmet|pedal|grip|pannier|lock|mount|trailer|bag|light|horn|mirror|bell|tool|pump|wheel|tire|tube|chain|brake|display|seat|post|stem|handlebar|motor|hub|sensor|spoke|cable|cassette|derailleur|headlight)\b/i.test(
      title,
    )
  )
    return false;
  if (/^parts$|^accessories$|^apparel$|^drones?$/i.test(type)) return false;
  if (/\bbundle\b|\bkit\b|\bcombo\b|\bcare plan\b|\bwarranty\b|\brange system\b/i.test(blob))
    return false;
  if (/\bgift card\b|\bpaint\b|\bdecal\b|\bskin\b|\btest product\b/i.test(blob)) return false;

  // Non-bike tech — drones, scooters with skateboard/skate wording
  if (/\bhoverair\b|\bdrone\b|\bdji\b|\bgopro\b/i.test(blob)) return false;

  // Must plausibly reference a bike product
  return /(ebike|e-bike|electric\s+(bike|bicycle|trike|tricycle)|\bbicycle\b|\btrike\b|\btricycle\b|xp\s*\d|xpeak|xpress|xpedition|pace|level|aventure|soltera|abound|ramblas|current|nomad|discover|tempo|summit|fold|gomad|triker|t1|radrunner|radwagon|radexpand|radster|radrover|\bone\b|aurora|ranger|apex|voyager|recon|pathfinder|boomerang|element|ridge rider|trail tracker|interceptor|city commuter|cruiser|cobra|escape|zebra|rhino|atlas|omega|galaxy|quest|delta|c1|c3|c5|b3|d3|d5|d7)/i.test(
    blob,
  );
}

/** Lazy, shared browser instance across calls within one script run. */
let _browser = null;
let _browserPromise = null;
async function getBrowser() {
  if (_browser) return _browser;
  if (_browserPromise) return _browserPromise;
  _browserPromise = (async () => {
    const { chromium } = await import('playwright');
    _browser = await chromium.launch({ headless: true });
    return _browser;
  })();
  return _browserPromise;
}

export async function closeBrowser() {
  if (_browser) {
    try {
      await _browser.close();
    } catch {
      /* ignore */
    }
    _browser = null;
    _browserPromise = null;
  }
}

/** Fetch JSON via plain Node fetch. Throws on HTML / non-JSON / error. */
async function fetchJsonPlain(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = (await res.text()).trim();
  if (!txt.startsWith('{') && !txt.startsWith('[')) throw new Error('non-JSON');
  return JSON.parse(txt);
}

/** Fetch JSON via Playwright (warms origin first, then fetches inside page). */
async function fetchJsonViaBrowser(url) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ userAgent: BROWSER_UA, locale: 'en-US' });
  try {
    const page = await ctx.newPage();
    const origin = new URL(url).origin;
    // Warm the origin so session cookies (Shopify, Cloudflare) are set.
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const viaFetch = await page.evaluate(async (target) => {
      const r = await fetch(target, {
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      const body = (await r.text()).trim();
      return { ok: r.ok, status: r.status, body };
    }, url);
    if (!viaFetch.ok) throw new Error(`browser HTTP ${viaFetch.status}`);
    if (!viaFetch.body.startsWith('{') && !viaFetch.body.startsWith('[')) {
      throw new Error('browser non-JSON');
    }
    return JSON.parse(viaFetch.body);
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** Full Shopify catalog (all pages) with plain → browser fallback per page. */
export async function fetchShopifyCatalog(origin, { maxPages = 10, limit = 250 } = {}) {
  const all = [];
  let useBrowser = false;
  for (let page = 1; page <= maxPages; page++) {
    const urls = [
      `${origin}/products.json?limit=${limit}&page=${page}`,
      `${origin}/collections/all/products.json?limit=${limit}&page=${page}`,
    ];
    let pageProducts = null;
    for (const u of urls) {
      try {
        const data = useBrowser ? await fetchJsonViaBrowser(u) : await fetchJsonPlain(u);
        pageProducts = data.products || [];
        break;
      } catch (e) {
        // plain fetch failed — try browser once for this page
        if (!useBrowser) {
          try {
            const data = await fetchJsonViaBrowser(u);
            pageProducts = data.products || [];
            useBrowser = true; // stick with browser for remaining pages
            break;
          } catch {
            /* try next URL */
          }
        }
      }
    }
    if (pageProducts === null) break;
    if (!pageProducts.length) break;
    all.push(...pageProducts);
    if (pageProducts.length < limit) break;
  }
  return all;
}

/** HEAD/GET URL check with no browser. */
export async function urlCheckPlain(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' },
        signal: controller.signal,
      });
      if (res.status === 405 || res.status === 403) {
        res = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html', Range: 'bytes=0-0' },
          signal: controller.signal,
        });
      }
    } finally {
      clearTimeout(t);
    }
    return { status: res.status, finalUrl: res.url, ok: res.ok };
  } catch (err) {
    return { status: 0, error: err?.message || String(err) };
  }
}

/**
 * Re-verify URL in a real browser. Navigates and returns the response status.
 * Used when plain fetch returns 403/404/429 that are likely bot-detection noise.
 */
export async function urlCheckBrowser(url) {
  try {
    const browser = await getBrowser();
    const ctx = await browser.newContext({ userAgent: BROWSER_UA, locale: 'en-US' });
    try {
      const page = await ctx.newPage();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response) return { status: 0, error: 'no response' };
      const status = response.status();
      // Some sites serve a 200 HTML page that shows "Not Found" copy — detect it.
      if (status === 200) {
        const content = await page.content();
        const head = content.slice(0, 8000).toLowerCase();
        if (/page not found|product not found|404 not found|we can't find that/.test(head)) {
          return { status: 404, final: page.url(), ok: false, note: 'soft-404' };
        }
      }
      return { status, final: page.url(), ok: status >= 200 && status < 400 };
    } finally {
      await ctx.close().catch(() => {});
    }
  } catch (err) {
    return { status: 0, error: err?.message || String(err) };
  }
}
