/**
 * Enrich `bikes` from brand storefronts (Shopify JSON API + Playwright fallback).
 *
 * - Pulls popular/current products, images, canonical URLs (use as affiliate_url until programs approve).
 * - Parses common spec tokens from product HTML (motor W, Wh, range, weight, class).
 * - Upserts by slug `{brandSlug}-{handle}` (dedupes double brand prefix on handles).
 * - Preserves pros, cons, best_for, expert_rating on existing rows (not overwritten).
 *
 * Usage:
 *   node scripts/enrich-bikes-from-brands.mjs              # all active brands with Shopify origin
 *   node scripts/enrich-bikes-from-brands.mjs --dry-run    # parse + log, no DB writes
 *   node scripts/enrich-bikes-from-brands.mjs --test       # fetch smoke test only (no DB)
 *   node scripts/enrich-bikes-from-brands.mjs --brand=lectric
 *   node scripts/enrich-bikes-from-brands.mjs --limit=15   # max products per brand
 *
 * Requires: DATABASE_URL in .env (except --test).
 * Playwright fallback: run `npx playwright install chromium` once so blocked JSON endpoints
 * (e.g. some storefronts) can still be read in a browser context.
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const env = Object.fromEntries(
  envFile
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

/** @type {import('postgres').Sql | null} */
let sql = null;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const testOnly = args.includes('--test');
const brandArg = args.find((a) => a.startsWith('--brand='))?.split('=')[1];
const limitArg = args.find((a) => a.startsWith('--limit='));
const perBrandLimit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 50) : 50;

/**
 * Optional overrides per brand slug.
 * strategy: 'shopify' (default) | 'skip'
 */
const BRAND_RULES = {
  lectric: { maxProducts: 60 },
  aventon: { maxProducts: 60 },
  velotric: { maxProducts: 40 },
  'rad-power-bikes': { maxProducts: 60 },
  pedego: { maxProducts: 40 },
  himiway: { maxProducts: 40 },
  evelo: { maxProducts: 30 },
  quietkat: { maxProducts: 30 },
  // Heavy SPAs / non-Shopify catalog — skip until a dedicated adapter exists
  trek: { strategy: 'skip', reason: 'Trek uses SPA catalog; needs custom scraper' },
  specialized: { strategy: 'skip', reason: 'Specialized uses SPA catalog' },
  giant: { strategy: 'skip', reason: 'Giant uses SPA catalog' },
  cannondale: { strategy: 'skip', reason: 'Cannondale uses SPA catalog' },
  tern: { strategy: 'skip', reason: 'Tern site structure differs; use manual/API later' },
  gazelle: { strategy: 'skip', reason: 'Gazelle uses SPA catalog' },
  ride1up: {
    strategy: 'skip',
    reason: 'Ride1UP uses WordPress (/product/…); /products.json is not Shopify JSON',
  },
};

function toSlug(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function originFromWebsite(website) {
  try {
    return new URL(website).origin;
  } catch {
    return null;
  }
}

function bikeSlug(brandSlug, handle) {
  let h = String(handle || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (h.startsWith(`${brandSlug}-`)) return h;
  return `${brandSlug}-${h}`;
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSpecs(text) {
  const t = text.replace(/\u2013/g, '-');
  const out = {};
  const w = t.match(/(\d{3,4})\s*W(?![hH])/);
  if (w) out.motor_watts = parseInt(w[1], 10);
  const wh = t.match(/(\d{3,4})\s*Wh\b/i);
  if (wh) out.battery_wh = parseInt(wh[1], 10);
  const rRange = t.match(/(\d+)\s*-\s*(\d+)\s*mi(?:les)?\b/i);
  if (rRange) {
    out.range_miles_low = +rRange[1];
    out.range_miles_high = +rRange[2];
  } else {
    const rUp = t.match(/up to\s*(\d+)\s*mi(?:les)?\b/i);
    if (rUp) out.range_miles_high = +rUp[1];
  }
  const lbs = t.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs)\b/i);
  if (lbs) out.weight_lbs = parseFloat(lbs[1]);
  const mph = t.match(/\b(\d{1,2})\s*mph\b/i);
  if (mph) out.top_speed_mph = parseInt(mph[1], 10);
  const cls = t.match(/class\s*([123])\b/i);
  if (cls) out.ebike_class = parseInt(cls[1], 10);
  return out;
}

function boolFromText(text, re) {
  return re.test(text);
}

/** Shopify `tags` may be a comma-separated string or an array of strings */
function tagsToString(tags) {
  if (tags == null) return '';
  if (Array.isArray(tags)) return tags.join(' ');
  return String(tags).split(/\s*,\s*/).join(' ');
}

function plainTitle(product) {
  return stripHtml(product.title || product.handle || '').replace(/\s+/g, ' ').trim();
}

function inferCategorySlug(product) {
  const tags = tagsToString(product.tags);
  const blob = `${product.product_type || ''} ${tags} ${plainTitle(product)}`.toLowerCase();
  if (/\bcargo\b|longtail|haul|wagon|abound|gsd\b/i.test(blob)) return 'cargo';
  if (/\bfold|folding|compact|xp\s*\d/i.test(blob)) return 'folding';
  if (/\bmtb|mountain|trail|full\s*suspension|enduro|emtb/i.test(blob)) return 'mountain';
  if (/\bfat\s*tire|4\.?0"|4"\s*tire/i.test(blob)) return 'fat-tire';
  if (/\bcruiser|beach|step[- ]?through|lowstep|ease\b/i.test(blob)) return 'cruiser';
  if (/\broad\b|gravel|drop\s*bar/i.test(blob)) return 'road-gravel';
  if (/\bmoped|scrambler|motorbike/i.test(blob)) return 'moped-style';
  if (/\bhunt|quietkat|camo/i.test(blob)) return 'hunting';
  return 'commuter';
}

/**
 * Parts, batteries, racks, and SKUs that are not complete e-bikes.
 */
function isExcludedAccessoryProduct(product) {
  const title = plainTitle(product).toLowerCase();
  const handle = String(product.handle || '').toLowerCase();
  const type = String(product.product_type || '').toLowerCase();
  const blob = `${title} ${handle} ${type}`;

  if (/pdp test|test product|\btest\s*listing\b/i.test(blob)) return true;
  if (/^battery\s*[-–]|^battery\s+-\s+\d+v/i.test(title)) return true;
  if (/\blong range cargo battery\b|\bcargo battery\b/i.test(title)) return true;
  if (/\b(spare|replacement)\s+battery\b/i.test(blob)) return true;
  if (/\bspare\b.*\bbattery\b/i.test(blob)) return true;
  if (/\b\d+v\s*\d*ah\b/i.test(title) && /\bbattery\b/i.test(title)) return true;
  if (/\bsafe shield\b.*\bbattery\b/i.test(blob)) return true;
  if (/\bmotor\s*cover\b|mid-drive\s*motor\s*cover\b/i.test(blob)) return true;
  if (/\b(battery|motor)\b.*\bcover\b/i.test(blob) && !/\bebike|e-bike|bike\b/i.test(title)) return true;
  if (/\b(upper|bottom)\b.*\b(battery|fixture|hardware)\b/i.test(blob)) return true;
  if (/\bcharge port cover\b|external battery charge port\b/i.test(blob)) return true;
  if (/\b(rad|external)\s*battery\s*charger\b|\bcharger\s*\(my/i.test(blob)) return true;
  if (/\brecycling fee\b/i.test(blob)) return true;
  if (/\bcare\b.*\byear\s*plan\b|\b\d+[- ]?year\s+plan\b|extended\s*care\b/i.test(blob)) return true;
  if (/\bdestination e bike rack\b|\brv rider\b|\bsport rider\b.*\brack\b/i.test(blob)) return true;
  if (/\be-bike rack for electric\b|\btrike adapter kit\b/i.test(blob)) return true;
  if (/\bfor electric bikes \(1-1\/4"\)\b/i.test(title)) return true;
  if (type.includes('parts') || /^parts$/i.test(type) || /^accessories$/i.test(type)) return true;

  // Small parts & apparel (OEM Shopify noise)
  if (
    /\b(helmet|phone mount|muc-off|nano tech|brush set|cleaner:|spray bottle|abus\s)/i.test(blob)
  )
    return true;
  if (/\b(fork|handlebars?)\s*[-–]/i.test(title)) return true;
  if (/\b(derailleur|hanger|brake rotor|flywheel|freewheel|cassette)\b/i.test(title)) return true;
  if (/\b(throttle set|fender kit|kickstands?|half twist)\b/i.test(blob)) return true;
  if (/\b(handlebar|kickstand)\b/i.test(title) && !/\bebike|electric|radrunner|wagon\b/i.test(title))
    return true;
  if (/\bpivot pro\b.*\block\b|\bhitch rack\b.*\block\b/i.test(blob)) return true;
  if (/\b(pathfinder|apex)\s*battery\b|\bapex\b.*\bbattery\b/i.test(blob)) return true;
  if (/\bspare\s+\d/i.test(blob)) return true;
  if (/\b(premium|standard)\s+cargo bundle\b|\bfront cargo rack\b/i.test(title)) return true;
  if (/\bwaterproof pannier\b|\bpannier bag\b/i.test(title) && !/\bebike|trike\b/i.test(title))
    return true;
  if (/\btrucker hat\b|\bhoodie\b|\bbackpack\b|\bergonomic grips\b/i.test(blob)) return true;
  if (/\bgame trailer|cargo trailer\b/i.test(title)) return true;
  if (/\b(passenger|family)\s+(&\s*)?cargo bundle\b|\bfamily bundle\b|\block\s*&\s*go\b/i.test(blob))
    return true;

  const v0 = product.variants?.[0];
  const price = v0?.price != null ? parseFloat(String(v0.price)) : 0;
  if (price > 0 && price < 15 && !/\bebike|bike\b/i.test(title)) return true;
  if (price > 0 && price < 500 && /\b(bundle|kit|mount|lock|hat|grip|rotor|hanger)\b/i.test(title))
    return true;

  if (
    /\b(charger|fenders?|rear rack|front rack|modular rack|display|seatpost|pedals?|pump|support bar)\b/i.test(
      title,
    ) &&
    !/\bebike|e-bike|electric (bike|tricycle)|tricycle\b/i.test(title)
  )
    return true;
  if (/\b(hollywood|lumos|hoto)\b/i.test(title) && !/\bebike|tricycle\b/i.test(title)) return true;

  // Lectric Canadian-market bundle products — handles end in `-ca` and contain
  // bundled-accessory descriptions ("+ FREE LevelUp Rack ...").
  if (handle.endsWith('-ca') && /\+\s*free\b/i.test(title)) return true;

  // Bundle handles: contain accessory promo noise in the handle itself
  // (e.g. "…-free-levelup-rack-suspension-seat-post-…")
  if (/\bfree[-_]levelup\b|\bfree[-_]rack\b|\bfree[-_]headlight\b/i.test(handle)) return true;

  // Radster Road / Trail: already seeded via replace-discontinued-bikes.mjs under
  // shorter slugs (rad-power-bikes-radster-road / rad-power-bikes-radster-trail).
  // Skip the full-handle duplicates to avoid two rows for the same bike.
  if (/radster[-_](road|trail)/i.test(handle)) return true;

  return false;
}

function isProbablyEbike(product, brandSlug = '') {
  if (isExcludedAccessoryProduct(product)) return false;

  const body = stripHtml(product.body_html || '').slice(0, 3000).toLowerCase();
  const tags = tagsToString(product.tags).toLowerCase();
  const title = plainTitle(product).toLowerCase();
  const type = String(product.product_type || '').toLowerCase();
  const blob = `${title} ${type} ${tags} ${body}`;

  if (/\bgift\s*card\b/i.test(blob)) return false;

  if (/\b(e[- ]?bike|ebike|electric\s*(bike|bicycle)|pedal\s*assist)\b/i.test(blob)) return true;
  if (/\b(electric|e-)\b/i.test(blob) && /\b(bike|bicycle)\b/i.test(blob)) return true;

  // Titles often omit "electric" (Lectric XP, Rad models, Aventon, etc.)
  if (/\b(xp\s*[0-9]|xpedition|xpeak|xpress|lectric one)\b/i.test(blob)) return true;
  if (/\b(radrunner|radwagon|radexpand|radster|radrover|bash\/mtn|switch\/mtn)\b/i.test(blob)) return true;
  if (/\b(aventure|abound|pace\s*[\d.]+|level\s*[\d.]+|sinch|soltera|ramblas|current\s+(exp|adv))\b/i.test(blob))
    return true;
  if (
    /\bvelotric\b/i.test(blob) &&
    /\b(discover|nomad|summit|gomad|fold|triker)\b/i.test(blob) &&
    !/\b(charger|fenders?|rack|display|pump|pedals?|support bar|adapter)\b/i.test(title)
  )
    return true;
  if (
    /\bvelotric\b/i.test(blob) &&
    /\btempo\b/i.test(blob) &&
    /\bebike|e-bike|electric trike|tricycle\b/i.test(blob)
  )
    return true;
  if (/\bvelotric\b/i.test(blob) && /\bebike|e-bike|electric trike|tricycle\b/i.test(blob)) return true;
  if (/\b(himiway)\b/i.test(blob) && /\b(d\d|c1|kids).*\bebike\b/i.test(blob)) return true;
  if (brandSlug === 'quietkat' && /\b(ranger|apex|recon|jeep|pathfinder|voyager)\b/i.test(title)) return true;
  if (/\b(boomerang|element|ridge rider|trail tracker|interceptor|city commuter)\b/i.test(blob) && /:\s*(core|pro|\d{4})/i.test(title))
    return true;
  if (
    brandSlug === 'evelo' &&
    /\b(ebike|electric bike|electric bicycle|pedal assist)\b/i.test(blob) &&
    !/\b(battery|helmet|mount|cleaner)\b/i.test(title)
  )
    return true;

  const price = product.variants?.[0]?.price != null ? parseFloat(String(product.variants[0].price)) : 0;
  if (
    price >= 999 &&
    /\b(ebike|electric (bike|bicycle))\b/i.test(blob) &&
    !/^battery\s/i.test(title)
  )
    return true;

  return false;
}

function productUrl(origin, handle) {
  return `${origin}/products/${handle}`;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function parseResponseAsJson(response) {
  const text = (await response.text()).trim();
  if (text.startsWith('{') || text.startsWith('[')) return JSON.parse(text);
  const ct = (response.headers()['content-type'] || '').toLowerCase();
  throw new Error(`Expected JSON, got ${ct.slice(0, 48) || 'non-JSON body'}…`);
}

async function fetchJson(url, { useBrowser = false } = {}) {
  if (!useBrowser) {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': BROWSER_UA,
      },
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const t = text.trim();
    if (t.startsWith('<')) throw new Error('Unexpected HTML (not JSON)');
    return JSON.parse(t);
  }

  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    const msg = e?.message || String(e);
    if (/Executable doesn't exist|playwright install/i.test(msg)) {
      throw new Error(
        'Playwright browser missing — run: npx playwright install chromium',
      );
    }
    throw e;
  }
  let ctx;
  try {
    ctx = await browser.newContext({ userAgent: BROWSER_UA, locale: 'en-US' });
    const page = await ctx.newPage();
    const origin = new URL(url).origin;

    // Some Shopify fronts return HTML (challenge / empty session) on a cold products.json hit.
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

    let response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!response) throw new Error('No response');
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);

    let text = (await response.text()).trim();
    if (!text.startsWith('{') && !text.startsWith('[')) {
      const viaFetch = await page
        .evaluate(async (target) => {
          const r = await fetch(target, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          });
          const body = (await r.text()).trim();
          return { ok: r.ok, status: r.status, body };
        }, url)
        .catch(() => null);
      if (viaFetch?.ok && (viaFetch.body.startsWith('{') || viaFetch.body.startsWith('['))) {
        return JSON.parse(viaFetch.body);
      }
      const ct = (response.headers()['content-type'] || '').toLowerCase();
      throw new Error(`Expected JSON, got ${ct.slice(0, 48) || 'non-JSON body'}…`);
    }
    return JSON.parse(text);
  } finally {
    try {
      await ctx?.close();
    } catch {
      /* ignore */
    }
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
}

async function fetchShopifyProductPage(origin, pageNum, limit) {
  const bases = [
    `${origin}/products.json`,
    `${origin}/collections/all/products.json`,
  ];
  let lastErr = null;
  for (const base of bases) {
    const url = `${base}?limit=${limit}&page=${pageNum}`;
    for (const useBrowser of [false, true]) {
      try {
        return await fetchJson(url, { useBrowser });
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('Shopify JSON fetch failed');
}

async function loadAllShopifyProducts(origin, { maxProducts = 250 } = {}) {
  const out = [];
  let page = 1;
  const limit = 250;
  while (out.length < maxProducts) {
    let data;
    try {
      data = await fetchShopifyProductPage(origin, page, limit);
    } catch (e) {
      console.warn(`    [${origin}] products.json page ${page}: ${e.message}`);
      throw e;
    }
    const products = data?.products || [];
    if (!products.length) break;
    out.push(...products);
    if (products.length < limit) break;
    page++;
    await sleep(800);
  }
  return out.slice(0, maxProducts);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function productToRow(brandSlug, origin, product, categorySlug) {
  const handle = product.handle;
  const slug = bikeSlug(brandSlug, handle);
  const bodyText = stripHtml(product.body_html);
  const specs = parseSpecs(bodyText + ' ' + (product.title || ''));
  const variant = product.variants?.[0] || {};
  const price = variant.price != null ? Math.round(parseFloat(String(variant.price))) : null;
  const compare = variant.compare_at_price != null ? Math.round(parseFloat(String(variant.compare_at_price))) : null;
  const imgs = (product.images || []).map((im) => im.src).filter(Boolean);
  const hero = imgs[0] || null;
  const gallery = imgs.slice(1);

  return {
    slug,
    model_name: plainTitle(product).slice(0, 200) || handle,
    year: new Date().getFullYear(),
    msrp: compare && price && compare > price ? compare : price,
    sale_price: compare && price && compare > price ? price : null,
    category: categorySlug,
    affiliate_url: productUrl(origin, handle),
    hero_image_url: hero,
    gallery_images: gallery.length ? gallery : null,
    has_torque_sensor: boolFromText(bodyText, /torque\s*sensor/i),
    has_throttle: boolFromText(bodyText, /\bthrottle\b/i),
    ...specs,
  };
}

/**
 * @param {import('postgres').Sql} sql
 */
async function upsertBike(sqlConn, brandId, row) {
  const g = row.gallery_images;
  return sqlConn`
    INSERT INTO bikes (
      brand_id, model_name, slug, year, msrp, sale_price, category,
      ebike_class, motor_watts, battery_wh, range_miles_low, range_miles_high,
      top_speed_mph, weight_lbs, has_throttle, has_torque_sensor,
      key_features, hero_image_url, gallery_images, affiliate_url,
      is_active
    ) VALUES (
      ${brandId}, ${row.model_name}, ${row.slug}, ${row.year}, ${row.msrp ?? null},
      ${row.sale_price ?? null}, ${row.category}, ${row.ebike_class ?? null},
      ${row.motor_watts ?? null}, ${row.battery_wh ?? null}, ${row.range_miles_low ?? null},
      ${row.range_miles_high ?? null}, ${row.top_speed_mph ?? null}, ${row.weight_lbs ?? null},
      ${row.has_throttle ?? false}, ${row.has_torque_sensor ?? false},
      ${sqlConn.array([])},
      ${row.hero_image_url}, ${g && g.length ? sqlConn.array(g) : null},
      ${row.affiliate_url}, true
    )
    ON CONFLICT (slug) DO UPDATE SET
      model_name = EXCLUDED.model_name,
      year = EXCLUDED.year,
      msrp = COALESCE(EXCLUDED.msrp, bikes.msrp),
      sale_price = EXCLUDED.sale_price,
      category = EXCLUDED.category,
      ebike_class = COALESCE(EXCLUDED.ebike_class, bikes.ebike_class),
      motor_watts = COALESCE(EXCLUDED.motor_watts, bikes.motor_watts),
      battery_wh = COALESCE(EXCLUDED.battery_wh, bikes.battery_wh),
      range_miles_low = COALESCE(EXCLUDED.range_miles_low, bikes.range_miles_low),
      range_miles_high = COALESCE(EXCLUDED.range_miles_high, bikes.range_miles_high),
      top_speed_mph = COALESCE(EXCLUDED.top_speed_mph, bikes.top_speed_mph),
      weight_lbs = COALESCE(EXCLUDED.weight_lbs, bikes.weight_lbs),
      has_throttle = EXCLUDED.has_throttle,
      has_torque_sensor = COALESCE(EXCLUDED.has_torque_sensor, bikes.has_torque_sensor),
      hero_image_url = COALESCE(bikes.hero_image_url, EXCLUDED.hero_image_url),
      gallery_images = COALESCE(EXCLUDED.gallery_images, bikes.gallery_images),
      affiliate_url = COALESCE(EXCLUDED.affiliate_url, bikes.affiliate_url),
      updated_at = NOW()
    RETURNING id
  `;
}

/** @param {import('postgres').Sql} sqlConn */
async function syncBikeCategory(sqlConn, bikeId, categorySlug, catMap) {
  const cid = catMap[categorySlug];
  if (!cid) return;
  await sqlConn`DELETE FROM bike_categories WHERE bike_id = ${bikeId}`;
  await sqlConn`
    INSERT INTO bike_categories (bike_id, category_id) VALUES (${bikeId}, ${cid})
    ON CONFLICT DO NOTHING
  `;
}

async function runTest() {
  console.log('\n[eBikeLocal enrich] --test  Shopify products.json smoke test\n');
  const brands = brandArg
    ? [{ slug: brandArg, website: guessWebsiteForSlug(brandArg) }].filter((b) => b.website)
    : DEFAULT_TEST_BRANDS;

  const rows = [];
  for (const b of brands) {
    const origin = originFromWebsite(b.website);
    if (!origin) continue;
    const url = `${origin}/products.json?limit=5&page=1`;
    let ok = false;
    let count = 0;
    let err = '';
    try {
      const data = await fetchJson(url, { useBrowser: false });
      count = data?.products?.length ?? 0;
      ok = Array.isArray(data?.products);
    } catch (e1) {
      err = e1.message;
      try {
        const data = await fetchJson(url, { useBrowser: true });
        count = data?.products?.length ?? 0;
        ok = true;
        err = `(recovered via Playwright; first error: ${err})`;
      } catch (e2) {
        err = `${err} | playwright: ${e2.message}`;
      }
    }
    rows.push({ brand: b.slug, url, ok, sampleCount: count, note: err });
    console.log(
      `  ${ok ? '✓' : '✗'} ${b.slug.padEnd(16)} sample=${count}  ${ok ? '' : err}`,
    );
    await sleep(500);
  }
  const anyOk = rows.some((r) => r.ok);
  console.log(`\n  Result: ${anyOk ? 'at least one endpoint responded' : 'all failed — check network / blocking'}\n`);
  process.exit(anyOk ? 0 : 1);
}

/** When DB unavailable, minimal list for --test */
const DEFAULT_TEST_BRANDS = [
  { slug: 'lectric', website: 'https://www.lectricebikes.com' },
  { slug: 'aventon', website: 'https://www.aventon.com' },
  { slug: 'velotric', website: 'https://www.velotricbike.com' },
  { slug: 'rad-power-bikes', website: 'https://www.radpowerbikes.com' },
  { slug: 'pedego', website: 'https://www.pedegoelectricbikes.com' },
];

function guessWebsiteForSlug(slug) {
  const found = DEFAULT_TEST_BRANDS.find((b) => b.slug === slug);
  return found?.website || null;
}

async function main() {
  if (testOnly) {
    await runTest();
    return;
  }

  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL missing in .env');
    process.exit(1);
  }

  sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 3 });

  let brands = await sql`
    SELECT id, slug, name, website FROM brands WHERE is_active = true ORDER BY name
  `;
  if (brandArg) {
    brands = brands.filter((b) => b.slug === brandArg);
  }
  if (!brands.length) {
    console.error('No brands matched.');
    await sql.end();
    process.exit(1);
  }

  const categories = await sql`SELECT id, slug FROM categories`;
  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  let attempted = 0;
  let skipped = 0;
  const errors = [];

  console.log(`\n[eBikeLocal enrich] brands=${brands.length} dryRun=${dryRun} limit/brand=${perBrandLimit}\n`);

  for (const brand of brands) {
    const rule = BRAND_RULES[brand.slug] || {};
    if (rule.strategy === 'skip') {
      console.log(`  ⊘ ${brand.slug} — skip: ${rule.reason || 'configured'}`);
      skipped++;
      continue;
    }

    const origin = originFromWebsite(brand.website);
    if (!origin) {
      console.log(`  ⊘ ${brand.slug} — no website origin`);
      skipped++;
      continue;
    }

    const maxP = Math.min(perBrandLimit, rule.maxProducts ?? perBrandLimit);
    let products;
    try {
      products = await loadAllShopifyProducts(origin, { maxProducts: maxP });
    } catch (e) {
      errors.push({ brand: brand.slug, error: e.message });
      console.error(`  ✗ ${brand.slug} — ${e.message}`);
      continue;
    }

    const ebikes = products.filter((p) => isProbablyEbike(p, brand.slug));
    console.log(`  → ${brand.slug}: ${products.length} products, ${ebikes.length} e-bike-like (cap ${maxP})`);

    for (const product of ebikes) {
      const catSlug = inferCategorySlug(product);
      const row = productToRow(brand.slug, origin, product, catSlug);
      if (dryRun) {
        console.log(`     [dry-run] ${row.slug} | ${row.model_name.slice(0, 50)} | $${row.msrp ?? '?'} | img=${!!row.hero_image_url}`);
        continue;
      }

      try {
        const ret = await upsertBike(sql, brand.id, row);
        const bikeId = ret[0]?.id;
        if (bikeId) await syncBikeCategory(sql, bikeId, catSlug, catMap);
        attempted++;
      } catch (e) {
        errors.push({ brand: brand.slug, slug: row.slug, error: e.message });
        console.error(`     ✗ ${row.slug}: ${e.message}`);
      }
    }
    await sleep(1200);
  }

  if (!dryRun) {
    console.log(`\n  Upserts attempted: ${attempted}, errors: ${errors.length}`);
  }

  await sql.end();
  process.exit(errors.length && !dryRun && attempted === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
