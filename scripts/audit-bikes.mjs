/**
 * Audit bikes in the DB.
 *
 * Reports on:
 *   1. Per-brand counts + data completeness
 *   2. Category coverage matrix (highlights gaps like moped-style = 0 bikes)
 *   3. Affiliate URL health (HEAD/GET each URL, flag 4xx/5xx)
 *   4. Duplicate / near-duplicate models per brand
 *   5. Outdated models for Shopify brands — diff DB against live /products.json
 *      (catches e.g. "Lectric XP 3.0" once XP 4 ships)
 *   6. Mis-categorized step-through bikes sitting in cruiser/commuter
 *
 * Writes `docs/bike-audit-report.md` and logs a summary to stdout.
 *
 * Usage:
 *   node scripts/audit-bikes.mjs                # full audit, writes report
 *   node scripts/audit-bikes.mjs --skip-urls    # skip HTTP checks (fast)
 *   node scripts/audit-bikes.mjs --skip-live    # skip Shopify live-catalog diff
 *   node scripts/audit-bikes.mjs --brand=lectric
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  BROWSER_UA,
  urlCheckPlain,
  urlCheckBrowser,
  fetchShopifyCatalog,
  closeBrowser,
} from './_bike-fetch.mjs';

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
const sql = postgres(env.DATABASE_URL, { ssl: 'require' });

const args = process.argv.slice(2);
const skipUrls = args.includes('--skip-urls');
const skipLive = args.includes('--skip-live');
const brandArg = args.find((a) => a.startsWith('--brand='))?.split('=')[1];

// Brands with a public Shopify /products.json catalog — we can diff the DB
// against the live catalog to find outdated models and new arrivals.
const SHOPIFY_BRANDS = new Set([
  'lectric',
  'aventon',
  'velotric',
  'rad-power-bikes',
  'pedego',
  'himiway',
  'evelo',
  'quietkat',
]);

function handleFromAffiliateUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/products\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

// ─── string similarity (for duplicate detection) ────────────────────────────
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\bebike\b|\belectric bike\b|\belectric\b|\bebikes\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s) {
  return new Set(normalizeName(s).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ─── concurrency ────────────────────────────────────────────────────────────
async function mapWithConcurrency(items, worker, limit = 8) {
  const out = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

// ─── main ───────────────────────────────────────────────────────────────────
console.log('▶ Loading bikes from DB…');

const bikeFilter = brandArg
  ? sql`WHERE br.slug = ${brandArg}`
  : sql``;

const bikes = await sql`
  SELECT
    bk.id, bk.model_name, bk.slug, bk.category, bk.is_active,
    bk.affiliate_url, bk.hero_image_url, bk.msrp, bk.motor_watts, bk.battery_wh,
    bk.range_miles_high, bk.gallery_images,
    br.name AS brand_name, br.slug AS brand_slug, br.website AS brand_website
  FROM bikes bk
  JOIN brands br ON br.id = bk.brand_id
  ${bikeFilter}
  ORDER BY br.name, bk.model_name
`;

const brands = await sql`
  SELECT id, name, slug, website FROM brands
  ${brandArg ? sql`WHERE slug = ${brandArg}` : sql``}
  ORDER BY name
`;

const categories = await sql`SELECT slug, name, sort_order FROM categories ORDER BY sort_order, name`;
const CAT_SLUGS = categories.map((c) => c.slug);

console.log(`  loaded ${bikes.length} bikes across ${brands.length} brands`);

// 1. PER-BRAND SUMMARY ───────────────────────────────────────────────────────
const perBrand = brands.map((b) => {
  const rows = bikes.filter((x) => x.brand_slug === b.slug);
  const active = rows.filter((x) => x.is_active);
  return {
    brand: b.name,
    slug: b.slug,
    total: rows.length,
    active: active.length,
    inactive: rows.length - active.length,
    missing_image: active.filter(
      (x) => !x.hero_image_url && !(x.gallery_images && x.gallery_images.length),
    ).length,
    missing_affiliate: active.filter((x) => !x.affiliate_url).length,
    missing_specs: active.filter(
      (x) => !x.motor_watts || !x.battery_wh || !x.range_miles_high,
    ).length,
  };
});

// 2. CATEGORY COVERAGE MATRIX ───────────────────────────────────────────────
const coverage = {};
for (const b of brands) {
  coverage[b.slug] = Object.fromEntries(CAT_SLUGS.map((c) => [c, 0]));
}
for (const x of bikes) {
  if (!x.is_active) continue;
  if (!coverage[x.brand_slug]) continue;
  if (x.category in coverage[x.brand_slug]) coverage[x.brand_slug][x.category]++;
}

const gaps = [];
for (const b of brands) {
  for (const c of CAT_SLUGS) {
    if (coverage[b.slug][c] === 0) gaps.push({ brand: b.name, slug: b.slug, category: c });
  }
}

// 3. AFFILIATE URL HEALTH ───────────────────────────────────────────────────
let urlHealth = [];
if (!skipUrls) {
  const active = bikes.filter((x) => x.is_active && x.affiliate_url);
  console.log(`▶ Plain-fetch URL check (${active.length} urls)…`);
  const plainChecks = await mapWithConcurrency(
    active,
    async (x) => {
      const r = await urlCheckPlain(x.affiliate_url);
      return { ...x, check: r };
    },
    10,
  );
  // Flag network error or HTTP >= 400 on plain fetch.
  const flagged = plainChecks.filter((x) => {
    const s = x.check.status;
    return !s || s >= 400;
  });
  // Bot-detection codes are almost always false positives from Cloudflare /
  // rate-limiters — re-verify via Playwright to distinguish real 404s.
  const needsBrowser = flagged.filter((x) => [403, 404, 429, 0].includes(x.check.status));
  console.log(`  ${flagged.length} flagged → re-verifying ${needsBrowser.length} via browser…`);
  const browserResults = new Map();
  // Serialize browser checks to avoid overwhelming Chromium / remote sites.
  for (let i = 0; i < needsBrowser.length; i++) {
    const x = needsBrowser[i];
    process.stdout.write(`  [${i + 1}/${needsBrowser.length}] ${x.affiliate_url}`);
    const r = await urlCheckBrowser(x.affiliate_url);
    browserResults.set(x.id, r);
    console.log(` → ${r.status}${r.note ? ` (${r.note})` : ''}`);
  }
  urlHealth = flagged
    .map((x) => {
      const bc = browserResults.get(x.id);
      return { ...x, browser_check: bc || null };
    })
    // If the browser returns 2xx/3xx, the URL is actually fine — drop it.
    .filter((x) => {
      if (!x.browser_check) return true;
      const s = x.browser_check.status;
      return !s || s >= 400;
    });
  console.log(`  ${urlHealth.length} URLs confirmed broken after browser re-verify`);
}

// 4. DUPLICATES ─────────────────────────────────────────────────────────────
const duplicates = [];
for (const b of brands) {
  const rows = bikes.filter((x) => x.brand_slug === b.slug && x.is_active);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const sim = jaccard(rows[i].model_name, rows[j].model_name);
      if (sim >= 0.6) {
        duplicates.push({
          brand: b.name,
          sim: sim.toFixed(2),
          a: { slug: rows[i].slug, name: rows[i].model_name, msrp: rows[i].msrp },
          b: { slug: rows[j].slug, name: rows[j].model_name, msrp: rows[j].msrp },
        });
      }
    }
  }
}

// 5. OUTDATED MODELS via live Shopify diff ──────────────────────────────────
let outdated = [];
let liveOnlyCounts = {};
if (!skipLive) {
  const shopifyBrands = brands.filter((b) => SHOPIFY_BRANDS.has(b.slug));
  console.log(`▶ Fetching live Shopify catalogs for ${shopifyBrands.length} brands…`);
  for (const b of shopifyBrands) {
    if (!b.website) continue;
    let origin;
    try {
      origin = new URL(b.website).origin;
    } catch {
      continue;
    }
    const products = await fetchShopifyCatalog(origin);
    if (!products.length) {
      console.log(`  ${b.slug}: no products fetched (skipped)`);
      continue;
    }
    const liveHandles = new Set(products.map((p) => String(p.handle || '').toLowerCase()));
    const dbRows = bikes.filter((x) => x.brand_slug === b.slug && x.is_active);
    for (const x of dbRows) {
      const h = handleFromAffiliateUrl(x.affiliate_url);
      if (!h) continue;
      if (!liveHandles.has(h)) {
        outdated.push({
          brand: b.name,
          slug: x.slug,
          model: x.model_name,
          affiliate_url: x.affiliate_url,
          handle: h,
        });
      }
    }
    const dbHandles = new Set(
      dbRows.map((x) => handleFromAffiliateUrl(x.affiliate_url)).filter(Boolean),
    );
    // Rough e-bike filter so we don't count accessories as "new arrivals"
    const newArrivals = products.filter((p) => {
      const h = String(p.handle || '').toLowerCase();
      if (dbHandles.has(h)) return false;
      const title = String(p.title || '').toLowerCase();
      const type = String(p.product_type || '').toLowerCase();
      const blob = `${title} ${type}`;
      const price = parseFloat(p.variants?.[0]?.price || '0');
      if (price < 700) return false;
      if (/battery|charger|rack|helmet|cover|fender|pedal|grip|pannier/.test(blob)) return false;
      return /(ebike|e-bike|electric|bike|xp|pace|level|aventure|nomad|discover|xpress|xpeak|one|radrunner|radwagon|radexpand|radster|aurora|ranger|apex|voyager|boomerang|element|pathfinder)/.test(
        blob,
      );
    });
    liveOnlyCounts[b.slug] = newArrivals.length;
    console.log(
      `  ${b.slug}: ${products.length} live, ${outdated.filter((o) => o.brand === b.name).length} DB-outdated, ~${newArrivals.length} new candidates`,
    );
  }
}

// 6. MIS-CATEGORIZED STEP-THROUGHS ──────────────────────────────────────────
const miscategorized = bikes.filter(
  (x) =>
    x.is_active &&
    x.category !== 'step-through' &&
    /\bstep[- ]?through\b|\blowstep\b|\bstep[- ]?thru\b/i.test(x.model_name),
);

// 7. INVALID / SUSPICIOUS URL PATTERNS (string-level checks) ────────────────
const suspiciousUrls = bikes.filter((x) => {
  if (!x.is_active || !x.affiliate_url) return false;
  const u = x.affiliate_url;
  if (u.includes('%252b') || u.includes('%2520')) return true; // double-encoded
  if (!/^https?:\/\//.test(u)) return true;
  return false;
});

// ─── WRITE MARKDOWN REPORT ──────────────────────────────────────────────────
const now = new Date().toISOString().slice(0, 10);
const lines = [];
lines.push(`# Bike catalog audit — ${now}`);
lines.push('');
lines.push(`Active bikes in DB: **${bikes.filter((x) => x.is_active).length}** across **${brands.length}** brands.`);
lines.push('');

// 1. per-brand
lines.push('## 1. Per-brand summary');
lines.push('');
lines.push('| Brand | Active | Missing image | Missing affiliate | Missing core specs |');
lines.push('|---|---:|---:|---:|---:|');
for (const r of perBrand) {
  lines.push(
    `| ${r.brand} (${r.slug}) | ${r.active} | ${r.missing_image} | ${r.missing_affiliate} | ${r.missing_specs} |`,
  );
}
lines.push('');

// 2. category coverage
lines.push('## 2. Category coverage — ✅ = present, ❌ = zero bikes');
lines.push('');
const header = '| Brand | ' + CAT_SLUGS.join(' | ') + ' |';
const sep = '|---|' + CAT_SLUGS.map(() => '---:').join('|') + '|';
lines.push(header);
lines.push(sep);
for (const b of brands) {
  const row = [b.slug];
  for (const c of CAT_SLUGS) {
    const n = coverage[b.slug][c];
    row.push(n === 0 ? '❌' : String(n));
  }
  lines.push('| ' + row.join(' | ') + ' |');
}
lines.push('');
lines.push(`**Gaps identified:** ${gaps.length} (brand × category cells with zero bikes)`);
lines.push('');

// 3. URL health
lines.push('## 3. Affiliate URL health');
lines.push('');
if (skipUrls) {
  lines.push('_(skipped — rerun without `--skip-urls`)_');
} else if (!urlHealth.length) {
  lines.push('All affiliate URLs returned 2xx/3xx. ✅');
} else {
  lines.push('| Brand | Model | Plain | Browser | URL |');
  lines.push('|---|---|---:|---:|---|');
  for (const x of urlHealth) {
    const s = x.check.status || `ERR: ${x.check.error?.slice(0, 30) || 'net'}`;
    const bs = x.browser_check
      ? x.browser_check.status || `ERR: ${x.browser_check.error?.slice(0, 30) || 'net'}`
      : '—';
    const note = x.browser_check?.note ? ` (${x.browser_check.note})` : '';
    lines.push(`| ${x.brand_name} | ${x.model_name} | ${s} | ${bs}${note} | ${x.affiliate_url} |`);
  }
}
lines.push('');

// 3b. suspicious URL strings
if (suspiciousUrls.length) {
  lines.push('### Suspicious URL patterns (double-encoded etc.)');
  lines.push('');
  for (const x of suspiciousUrls) {
    lines.push(`- **${x.brand_name} ${x.model_name}** (${x.slug}) — \`${x.affiliate_url}\``);
  }
  lines.push('');
}

// 4. duplicates
lines.push('## 4. Duplicate / near-duplicate models');
lines.push('');
if (!duplicates.length) {
  lines.push('None detected.');
} else {
  lines.push('_Token-Jaccard ≥ 0.60 on model name, same brand._');
  lines.push('');
  lines.push('| Brand | Sim | A | B |');
  lines.push('|---|---:|---|---|');
  for (const d of duplicates) {
    lines.push(
      `| ${d.brand} | ${d.sim} | ${d.a.name} ($${d.a.msrp ?? '?'}) \`${d.a.slug}\` | ${d.b.name} ($${d.b.msrp ?? '?'}) \`${d.b.slug}\` |`,
    );
  }
}
lines.push('');

// 5. outdated
lines.push('## 5. Outdated models (Shopify-brand diff)');
lines.push('');
if (skipLive) {
  lines.push('_(skipped — rerun without `--skip-live`)_');
} else if (!outdated.length) {
  lines.push('No outdated models detected.');
} else {
  lines.push('These DB rows reference product handles that are no longer in the brand\'s live catalog — likely discontinued.');
  lines.push('');
  lines.push('| Brand | Model | Slug | Handle (missing) |');
  lines.push('|---|---|---|---|');
  for (const o of outdated) {
    lines.push(`| ${o.brand} | ${o.model} | \`${o.slug}\` | \`${o.handle}\` |`);
  }
}
lines.push('');
if (!skipLive && Object.keys(liveOnlyCounts).length) {
  lines.push('### Approximate new candidates per brand (in live catalog, not in DB)');
  lines.push('');
  for (const [k, v] of Object.entries(liveOnlyCounts)) {
    lines.push(`- **${k}**: ~${v} candidate products (run \`discover-bikes\` for details)`);
  }
  lines.push('');
}

// 6. miscategorized
lines.push('## 6. Mis-categorized step-through bikes');
lines.push('');
if (!miscategorized.length) {
  lines.push('No obvious miscategorizations.');
} else {
  lines.push('Model names contain "step-through" but are not in the `step-through` category:');
  lines.push('');
  lines.push('| Brand | Model | Current category | Slug |');
  lines.push('|---|---|---|---|');
  for (const x of miscategorized) {
    lines.push(`| ${x.brand_name} | ${x.model_name} | ${x.category} | \`${x.slug}\` |`);
  }
}
lines.push('');

// summary
lines.push('---');
lines.push('## Summary');
lines.push('');
lines.push(`- ${bikes.filter((x) => x.is_active).length} active bikes across ${brands.length} brands`);
lines.push(`- ${gaps.length} brand×category gaps (out of ${brands.length * CAT_SLUGS.length} possible cells)`);
lines.push(`- ${urlHealth.length} broken/questionable affiliate URLs${skipUrls ? ' (checks skipped)' : ''}`);
lines.push(`- ${duplicates.length} duplicate-candidate pairs`);
lines.push(`- ${outdated.length} outdated (Shopify-diff) models${skipLive ? ' (checks skipped)' : ''}`);
lines.push(`- ${miscategorized.length} mis-categorized step-through bikes`);
lines.push('');
lines.push('Next step: run `npm run discover:bikes` to populate gap candidates.');
lines.push('');

const docsDir = join(__dirname, '..', 'docs');
if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });
const reportPath = join(docsDir, 'bike-audit-report.md');
writeFileSync(reportPath, lines.join('\n'), 'utf-8');
console.log(`\n✓ Report written to ${reportPath}`);
console.log(
  `  gaps=${gaps.length}  url_issues=${urlHealth.length}  duplicates=${duplicates.length}  outdated=${outdated.length}  miscategorized=${miscategorized.length}`,
);

await closeBrowser();
await sql.end();
