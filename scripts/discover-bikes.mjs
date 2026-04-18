/**
 * Discover bike candidates to fill brand × category coverage gaps.
 *
 * Strategy:
 *   - For Shopify brands, fetch the full live /products.json catalog.
 *   - For non-Shopify brands (Trek, Specialized, Giant, Cannondale, Gazelle,
 *     Tern, Ride1UP), read hard-coded `MANUAL_CANDIDATES` below — add to this
 *     list as curated picks. Non-Shopify SPAs require brand-specific scrapers.
 *   - Classify each candidate into one of the 10 canonical categories.
 *   - For each (brand, category) gap, propose the top 1-2 candidates.
 *   - Write a markdown report + a JSON plan. With `--apply`, insert chosen
 *     candidates into the `bikes` table (is_active=true, needs manual review).
 *
 * Usage:
 *   node scripts/discover-bikes.mjs                  # dry-run report + JSON plan
 *   node scripts/discover-bikes.mjs --brand=lectric  # scope to one brand
 *   node scripts/discover-bikes.mjs --category=step-through
 *   node scripts/discover-bikes.mjs --apply          # insert into DB
 *   node scripts/discover-bikes.mjs --limit=2        # candidates per gap (default 2)
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchShopifyCatalog, closeBrowser, isShopifyEbikeProduct } from './_bike-fetch.mjs';

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
const apply = args.includes('--apply');
const brandArg = args.find((a) => a.startsWith('--brand='))?.split('=')[1];
const categoryArg = args.find((a) => a.startsWith('--category='))?.split('=')[1];
const limitArg = parseInt(
  args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '2',
  10,
);

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

// Manual-seed entries for brands without a usable Shopify endpoint. These are
// placeholders — fill in real product URLs from the brand website to close
// specific category gaps. Each entry is inserted only if the (brand, category)
// cell is still empty.
//
// Fields: brand_slug, category, model_name, handle (for slug), affiliate_url,
// msrp (optional), motor_watts (optional), battery_wh (optional),
// range_miles_high (optional), best_for (optional).
const MANUAL_CANDIDATES = [
  // Trek — special case; images handled separately by user.
  {
    brand_slug: 'trek',
    category: 'step-through',
    model_name: 'Verve+ 2 Lowstep',
    handle: 'verve-plus-2-lowstep',
    affiliate_url:
      'https://www.trekbikes.com/us/en_US/bikes/hybrid-bikes/electric-hybrid-bikes/verve/verve-plus-2-lowstep/p/40081/',
    msrp: 2749,
  },
  {
    brand_slug: 'trek',
    category: 'cargo',
    model_name: 'Fetch+ 2',
    handle: 'fetch-plus-2',
    affiliate_url:
      'https://www.trekbikes.com/us/en_US/bikes/electric-bikes/electric-cargo-bikes/fetch/fetch-plus-2/p/37048/',
    msrp: 5499,
  },
  // Specialized
  {
    brand_slug: 'specialized',
    category: 'cargo',
    model_name: 'Turbo Porto',
    handle: 'turbo-porto',
    affiliate_url: 'https://www.specialized.com/us/en/turbo-porto/p/215301',
    msrp: 4000,
  },
  {
    brand_slug: 'specialized',
    category: 'cruiser',
    model_name: 'Turbo Como SL 4.0',
    handle: 'turbo-como-sl-4',
    affiliate_url: 'https://www.specialized.com/us/en/turbo-como-sl-4-0/p/217538',
    msrp: 4500,
  },
  // Giant
  {
    brand_slug: 'giant',
    category: 'cargo',
    model_name: 'Momentum PakYak E+',
    handle: 'momentum-pakyak-e',
    affiliate_url: 'https://www.momentum-biking.com/us/pakyak-e-plus',
    msrp: 4500,
  },
  // Cannondale
  {
    brand_slug: 'cannondale',
    category: 'mountain',
    model_name: 'Moterra Neo Carbon LT 2',
    handle: 'moterra-neo-carbon-lt-2',
    affiliate_url:
      'https://www.cannondale.com/en-us/bikes/electric/emtb/moterra-neo-carbon',
    msrp: 7500,
  },
  // Gazelle
  {
    brand_slug: 'gazelle',
    category: 'step-through',
    model_name: 'Arroyo C8 HMB',
    handle: 'arroyo-c8-hmb',
    affiliate_url: 'https://www.gazellebikes.com/en-us/bikes/arroyo-c8-hmb',
    msrp: 3299,
  },
  // Tern — already has GSD S10 (cargo) + Vektron (folding)
  {
    brand_slug: 'tern',
    category: 'commuter',
    model_name: 'Quick Haul D8',
    handle: 'quick-haul-d8',
    affiliate_url: 'https://www.ternbicycles.com/us/bikes/472/quick-haul-d8',
    msrp: 2499,
  },
  // Ride1UP
  {
    brand_slug: 'ride1up',
    category: 'cargo',
    model_name: 'Portola',
    handle: 'portola',
    affiliate_url: 'https://ride1up.com/product/portola/',
    msrp: 1295,
  },
  {
    brand_slug: 'ride1up',
    category: 'mountain',
    model_name: 'Rift',
    handle: 'rift',
    affiliate_url: 'https://ride1up.com/product/rift/',
    msrp: 2395,
  },
];

// ─── helpers ────────────────────────────────────────────────────────────────
function toSlug(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function bikeSlug(brandSlug, handle) {
  let h = toSlug(handle);
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

function tagsToString(tags) {
  if (tags == null) return '';
  if (Array.isArray(tags)) return tags.join(' ');
  return String(tags).split(/\s*,\s*/).join(' ');
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

/**
 * Score + classify a Shopify product into our 10 canonical categories.
 * Order matters — first matching rule wins. Returns null if not a bike.
 */
function classifyProduct(product, brandSlug) {
  // Strict is-bike filter first — rejects drones, motors, parts, bundles, etc.
  if (!isShopifyEbikeProduct(product)) return null;
  const title = stripHtml(product.title || '').toLowerCase();
  // Reject kids bikes, clearance items, and SKU-suffixed variant listings
  if (/\bkids?\b|\bjunior\b|\bchildren\b/i.test(title)) return null;
  if (/\bclearance\b|\bopen[- ]?box\b|\brefurbished\b/i.test(title)) return null;
  if (/\|\s*\d{4,}\s*$/.test(title)) return null; // "Galaxy Lux | 30033"
  const body = stripHtml(product.body_html || '').slice(0, 3000).toLowerCase();
  const tags = tagsToString(product.tags).toLowerCase();
  const type = String(product.product_type || '').toLowerCase();
  const blob = `${title} ${type} ${tags} ${body}`;

  // step-through detection — high priority to fix cruiser misclassification
  if (/step[- ]?through|step[- ]?thru|lowstep|low[- ]?step|midstep/i.test(blob)) return 'step-through';
  if (/\bfold|folding|compact|\bxp\s*\d/i.test(blob)) return 'folding';
  if (/\bcargo\b|longtail|haul|wagon|abound|gsd\b|xpedition/i.test(blob)) return 'cargo';
  if (/\bmoped|scrambler|motorbike/i.test(blob)) return 'moped-style';
  if (/\bhunt|camo|quietkat/i.test(blob)) return 'hunting';
  if (/\bmtb|mountain|trail|full[- ]?suspension|enduro|emtb|rift\b/i.test(blob)) return 'mountain';
  if (/\bfat[- ]?tire|4\.?0"?\s*tire|aventure|radrover|himiway\s+cruiser/i.test(blob)) return 'fat-tire';
  if (/\bcruiser|beach|interceptor/i.test(blob)) return 'cruiser';
  if (/\broad\b|gravel|drop[- ]?bar|domane/i.test(blob)) return 'road-gravel';
  if (/\bcommuter|city|urban|pace|level|discover|ridge rider|element|boomerang/i.test(blob))
    return 'commuter';
  // default — still a bike, bucket as commuter
  return 'commuter';
}

function productUrl(origin, handle) {
  return `${origin}/products/${handle}`;
}

function buildCandidateFromShopifyProduct(product, brand, category) {
  const origin = (() => {
    try {
      return new URL(brand.website).origin;
    } catch {
      return null;
    }
  })();
  const handle = String(product.handle || '').toLowerCase();
  const specs = parseSpecs(`${stripHtml(product.body_html || '')} ${stripHtml(product.title || '')}`);
  const price = parseFloat(product.variants?.[0]?.price || '0') || null;
  const hero = product.images?.[0]?.src || null;
  const gallery = (product.images || []).map((i) => i.src).filter(Boolean);
  return {
    source: 'shopify',
    brand_slug: brand.slug,
    brand_name: brand.name,
    category,
    model_name: stripHtml(product.title || '').trim(),
    slug: bikeSlug(brand.slug, handle),
    handle,
    affiliate_url: origin ? productUrl(origin, handle) : null,
    msrp: price ? Math.round(price) : null,
    hero_image_url: hero,
    gallery_images: gallery.slice(0, 6),
    year: product.published_at ? new Date(product.published_at).getFullYear() : null,
    ...specs,
  };
}

function buildCandidateFromManual(m, brand) {
  return {
    source: 'manual',
    brand_slug: brand.slug,
    brand_name: brand.name,
    category: m.category,
    model_name: m.model_name,
    slug: bikeSlug(brand.slug, m.handle),
    handle: toSlug(m.handle),
    affiliate_url: m.affiliate_url,
    msrp: m.msrp ?? null,
    hero_image_url: null,
    gallery_images: [],
    motor_watts: m.motor_watts ?? null,
    battery_wh: m.battery_wh ?? null,
    range_miles_high: m.range_miles_high ?? null,
    best_for: m.best_for ?? null,
  };
}

// ─── main ───────────────────────────────────────────────────────────────────
console.log('▶ Loading DB state…');

const brands = await sql`
  SELECT id, name, slug, website FROM brands
  ${brandArg ? sql`WHERE slug = ${brandArg}` : sql``}
  ORDER BY name
`;

const bikesRows = await sql`
  SELECT br.slug AS brand_slug, bk.category, bk.slug, bk.model_name, bk.is_active
  FROM bikes bk JOIN brands br ON br.id = bk.brand_id
`;

const categories = await sql`SELECT slug FROM categories ORDER BY sort_order`;
const CAT_SLUGS = categoryArg ? [categoryArg] : categories.map((c) => c.slug);

// Existing coverage map and existing slugs
const existingSlugs = new Set(bikesRows.map((r) => r.slug));
const coverage = {};
for (const b of brands) coverage[b.slug] = Object.fromEntries(CAT_SLUGS.map((c) => [c, 0]));
for (const r of bikesRows) {
  if (!r.is_active) continue;
  if (coverage[r.brand_slug] && r.category in coverage[r.brand_slug]) coverage[r.brand_slug][r.category]++;
}

// Build candidates per brand
const plan = []; // { brand, category, candidates: [...] }

for (const brand of brands) {
  console.log(`\n▶ ${brand.name} (${brand.slug})`);
  const gaps = CAT_SLUGS.filter((c) => coverage[brand.slug][c] === 0);
  if (!gaps.length) {
    console.log('  no gaps — skipping');
    continue;
  }
  console.log(`  gaps: ${gaps.join(', ')}`);

  const candidatesByCategory = Object.fromEntries(gaps.map((c) => [c, []]));

  if (SHOPIFY_BRANDS.has(brand.slug) && brand.website) {
    let origin;
    try {
      origin = new URL(brand.website).origin;
    } catch {
      origin = null;
    }
    if (origin) {
      const products = await fetchShopifyCatalog(origin);
      console.log(`  fetched ${products.length} live products`);
      for (const p of products) {
        const cat = classifyProduct(p, brand.slug);
        if (!cat) continue;
        if (!candidatesByCategory[cat]) continue;
        const candidate = buildCandidateFromShopifyProduct(p, brand, cat);
        if (existingSlugs.has(candidate.slug)) continue;
        candidatesByCategory[cat].push(candidate);
      }
      // Rank: prefer products with images and in reasonable price range
      for (const cat of Object.keys(candidatesByCategory)) {
        candidatesByCategory[cat].sort((a, b) => {
          const ai = a.hero_image_url ? 1 : 0;
          const bi = b.hero_image_url ? 1 : 0;
          if (ai !== bi) return bi - ai;
          return (a.msrp ?? 99999) - (b.msrp ?? 99999);
        });
      }
    }
  } else {
    // Pull any manual entries for this brand that match a gap
    const manuals = MANUAL_CANDIDATES.filter(
      (m) => m.brand_slug === brand.slug && candidatesByCategory[m.category],
    );
    for (const m of manuals) {
      const c = buildCandidateFromManual(m, brand);
      if (existingSlugs.has(c.slug)) continue;
      candidatesByCategory[m.category].push(c);
    }
    if (!manuals.length) {
      console.log(`  (no Shopify + no manual seeds — add entries to MANUAL_CANDIDATES)`);
    }
  }

  for (const cat of gaps) {
    const top = candidatesByCategory[cat].slice(0, limitArg);
    if (!top.length) continue;
    plan.push({ brand: brand.name, brand_slug: brand.slug, category: cat, candidates: top });
    console.log(`  + ${cat}: ${top.length} candidate(s)`);
  }
}

// ─── WRITE ──────────────────────────────────────────────────────────────────
const docsDir = join(__dirname, '..', 'docs');
if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });

// JSON plan
const planPath = join(docsDir, 'bike-discovery-plan.json');
writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');

// Markdown report
const now = new Date().toISOString().slice(0, 10);
const md = [];
md.push(`# Bike discovery — candidates to fill gaps (${now})`);
md.push('');
md.push(`${plan.length} brand×category gaps have candidates. Total candidates: ${plan.reduce((a, p) => a + p.candidates.length, 0)}.`);
md.push('');
md.push(`Run with \`--apply\` to insert, or edit \`${planPath.replace(join(__dirname, '..') + '/', '')}\` first to curate.`);
md.push('');
for (const entry of plan) {
  md.push(`## ${entry.brand} — ${entry.category}`);
  md.push('');
  for (const c of entry.candidates) {
    md.push(`- **${c.model_name}** — $${c.msrp ?? '?'} — \`${c.slug}\``);
    md.push(`  - ${c.affiliate_url}`);
    if (c.hero_image_url) md.push(`  - image: ${c.hero_image_url}`);
    const specBits = [];
    if (c.motor_watts) specBits.push(`${c.motor_watts}W`);
    if (c.battery_wh) specBits.push(`${c.battery_wh}Wh`);
    if (c.range_miles_high) specBits.push(`${c.range_miles_high}mi`);
    if (specBits.length) md.push(`  - specs: ${specBits.join(', ')}`);
  }
  md.push('');
}
const reportPath = join(docsDir, 'bike-discovery-report.md');
writeFileSync(reportPath, md.join('\n'), 'utf-8');

console.log(`\n✓ Discovery plan → ${planPath}`);
console.log(`✓ Discovery report → ${reportPath}`);

// ─── APPLY (optional) ───────────────────────────────────────────────────────
if (apply) {
  console.log('\n▶ Applying plan to DB…');
  let inserted = 0;
  for (const entry of plan) {
    const brand = brands.find((b) => b.slug === entry.brand_slug);
    if (!brand) continue;
    for (const c of entry.candidates) {
      if (existingSlugs.has(c.slug)) continue;
      try {
        await sql`
          INSERT INTO bikes (
            brand_id, model_name, slug, year, msrp, category,
            motor_watts, battery_wh, range_miles_high,
            hero_image_url, gallery_images, affiliate_url, is_active
          ) VALUES (
            ${brand.id}, ${c.model_name}, ${c.slug}, ${c.year ?? null}, ${c.msrp ?? null}, ${c.category},
            ${c.motor_watts ?? null}, ${c.battery_wh ?? null}, ${c.range_miles_high ?? null},
            ${c.hero_image_url ?? null}, ${c.gallery_images?.length ? c.gallery_images : null},
            ${c.affiliate_url ?? null}, true
          )
          ON CONFLICT (slug) DO NOTHING
        `;
        existingSlugs.add(c.slug);
        inserted++;
        console.log(`  ✓ ${c.brand_name} → ${c.model_name} (${c.category})`);
      } catch (err) {
        console.error(`  ✗ ${c.slug}: ${err.message}`);
      }
    }
  }
  console.log(`\n✓ Inserted ${inserted} new bikes.`);
}

await closeBrowser();
await sql.end();
