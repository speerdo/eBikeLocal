/**
 * Apply fixes surfaced by `audit-bikes.mjs`.
 *
 *  1. Repair broken affiliate URLs on Shopify brands by matching DB rows to
 *     their closest-match handle in the live catalog (token-Jaccard >= 0.5).
 *     Updates affiliate_url, hero_image_url (if missing), and model_name / msrp
 *     when the live product's values are richer.
 *  2. Deactivate rows that have no live match — they are discontinued products.
 *  3. Fix Trek `%252b` → `%2B` double-encoding in affiliate URLs.
 *  4. Deactivate known-broken non-Shopify URLs where no simple fix applies
 *     (user can manually reinstate with correct URLs later).
 *  5. Re-categorize bikes whose model name contains "step-through" but are not
 *     already in the `step-through` category.
 *  6. Deduplicate obvious product repeats (Himiway D5 variants, RadWagon old
 *     slugs). Keeps the canonical row active, deactivates the rest.
 *
 * Dry-run by default. Pass `--apply` to write changes.
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
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
const mode = apply ? 'APPLY' : 'DRY-RUN';

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

// Non-Shopify rows that need manual handling. Value `null` → deactivate.
// If/when you find a correct URL, replace null with { affiliate_url: '...' }.
const NON_SHOPIFY_FIXES = {
  'gazelle-ultimate-c380-hmb': null,
  'giant-talon-e-2': null,
  'ride1up-700-series': null,
  'specialized-turbo-como-30': null,
  'specialized-turbo-levo-sl-comp': null,
  'specialized-turbo-vado-30': null,
};

// Obvious duplicates — map from DB slug → canonical slug to keep.
// Deactivates the "from" slugs. Canonical is never deactivated.
const DUPLICATE_MERGES = {
  // Himiway D5 family: 5 active rows for essentially one product line
  'himiway-d5-2-20': 'himiway-d5',
  'himiway-d5-2': 'himiway-d5',
  // Rad Power RadWagon old URL slugs (kept RadWagon 4 + RadWagon 5)
  'rad-power-bikes-radwagon-4-electric-cargo-bike': 'rad-power-bikes-radwagon-4',
  'rad-power-bikes-radwagon-electric-cargo-utility-bike': 'rad-power-bikes-radwagon-electric-cargo-bike',
};

// ─── helpers ────────────────────────────────────────────────────────────────
function normalizeTokens(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .replace(/\bebike\b|\belectric bike\b|\belectric\b|\bebikes\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean),
  );
}

function jaccard(a, b) {
  const A = normalizeTokens(a);
  const B = normalizeTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function stripHtml(h) {
  return String(h || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function handleFromAffiliateUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/products\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function originFromWebsite(website) {
  try {
    return new URL(website).origin;
  } catch {
    return null;
  }
}

// ─── main ───────────────────────────────────────────────────────────────────
console.log(`▶ Mode: ${mode}`);

const brands = await sql`SELECT id, name, slug, website FROM brands`;

const bikes = await sql`
  SELECT bk.id, bk.model_name, bk.slug, bk.category, bk.is_active,
    bk.affiliate_url, bk.hero_image_url, bk.gallery_images, bk.msrp,
    br.slug AS brand_slug, br.name AS brand_name
  FROM bikes bk JOIN brands br ON br.id = bk.brand_id
  WHERE bk.is_active = true
`;

// Fetch live Shopify catalogs once.
console.log('\n▶ Fetching live Shopify catalogs…');
const liveCatalogs = {}; // brand_slug -> { handlesSet, productByHandle }
for (const b of brands) {
  if (!SHOPIFY_BRANDS.has(b.slug)) continue;
  const origin = originFromWebsite(b.website);
  if (!origin) continue;
  const products = await fetchShopifyCatalog(origin);
  const byHandle = new Map();
  for (const p of products) {
    const h = String(p.handle || '').toLowerCase();
    if (h) byHandle.set(h, { ...p, origin });
  }
  liveCatalogs[b.slug] = byHandle;
  console.log(`  ${b.slug}: ${byHandle.size} products`);
}

// ─── 1 & 2. Broken URL repair for Shopify brands ────────────────────────────
const urlRepairs = []; // { bike, newUrl, newImage, newMsrp, newModelName }
const shopifyOrphans = []; // deactivations

for (const bike of bikes) {
  if (!SHOPIFY_BRANDS.has(bike.brand_slug)) continue;
  const live = liveCatalogs[bike.brand_slug];
  if (!live) continue;
  const handle = handleFromAffiliateUrl(bike.affiliate_url);
  if (!handle) continue;
  if (live.has(handle)) continue; // healthy

  // Find best match in live catalog by token similarity — limited to products
  // that actually look like complete e-bikes.
  const dbIsStepThrough = /\bstep[- ]?through\b|\bstep[- ]?thru\b|\bst\b/i.test(bike.model_name);
  let best = { score: 0, handle: null, product: null };
  for (const [h, p] of live.entries()) {
    if (!isShopifyEbikeProduct(p)) continue;
    const title = stripHtml(p.title || '');
    const liveIsStepThrough = /\bstep[- ]?through\b|\bstep[- ]?thru\b/i.test(
      `${title} ${h}`,
    );
    // If the DB row is a step-through variant, require the match to also be.
    // Otherwise we lose the variant distinction silently.
    if (dbIsStepThrough && !liveIsStepThrough) continue;
    const s = Math.max(jaccard(bike.model_name, title), jaccard(bike.slug, h));
    if (s > best.score) best = { score: s, handle: h, product: p };
  }

  if (best.score >= 0.5) {
    const p = best.product;
    const newUrl = `${p.origin}/products/${best.handle}`;
    const price = parseFloat(p.variants?.[0]?.price || '0');
    urlRepairs.push({
      bike,
      score: best.score.toFixed(2),
      newHandle: best.handle,
      newUrl,
      newImage: p.images?.[0]?.src || null,
      newGallery: (p.images || []).map((i) => i.src).filter(Boolean).slice(0, 6),
      newMsrp: price > 0 ? Math.round(price) : null,
      newModelName: stripHtml(p.title || ''),
    });
  } else {
    shopifyOrphans.push({ bike, reason: 'no live match', bestScore: best.score.toFixed(2) });
  }
}

// ─── 3. Trek %252b fix ──────────────────────────────────────────────────────
const trekEncodingFixes = bikes
  .filter((b) => b.affiliate_url && /%252b/i.test(b.affiliate_url))
  .map((b) => ({ bike: b, newUrl: b.affiliate_url.replace(/%252b/gi, '%2B') }));

// ─── 4. Non-Shopify deactivations ───────────────────────────────────────────
const nonShopifyDeactivations = bikes.filter((b) => b.slug in NON_SHOPIFY_FIXES);

// ─── 5. Step-through re-categorizations ─────────────────────────────────────
const recategorizations = bikes.filter(
  (b) =>
    b.category !== 'step-through' &&
    /\bstep[- ]?through\b|\bstep[- ]?thru\b|\blowstep\b/i.test(b.model_name),
);

// ─── 6. Duplicate merges ────────────────────────────────────────────────────
const dupDeactivations = bikes.filter((b) => b.slug in DUPLICATE_MERGES);

// ─── REPORT ─────────────────────────────────────────────────────────────────
console.log('\n═══════════════════ PLAN ═══════════════════');

console.log(`\n[1] URL repairs (${urlRepairs.length} bikes — Shopify live-catalog match)`);
for (const r of urlRepairs) {
  console.log(
    `  [${r.score}] ${r.bike.brand_name} "${r.bike.model_name}" → "${r.newModelName}"`,
  );
  console.log(`      ${r.bike.affiliate_url}`);
  console.log(`      → ${r.newUrl}`);
}

console.log(`\n[2] Deactivate (${shopifyOrphans.length} Shopify orphans — no live match)`);
for (const o of shopifyOrphans) {
  console.log(`  ${o.bike.brand_name} "${o.bike.model_name}" (slug=${o.bike.slug}) — best score ${o.bestScore}`);
}

console.log(`\n[3] Trek URL encoding fixes (${trekEncodingFixes.length})`);
for (const t of trekEncodingFixes) {
  console.log(`  ${t.bike.slug}`);
  console.log(`    ${t.bike.affiliate_url}`);
  console.log(`    → ${t.newUrl}`);
}

console.log(`\n[4] Non-Shopify deactivations (${nonShopifyDeactivations.length})`);
for (const b of nonShopifyDeactivations) {
  console.log(`  ${b.brand_name} "${b.model_name}" (slug=${b.slug})`);
}

console.log(`\n[5] Re-categorize step-throughs (${recategorizations.length})`);
for (const b of recategorizations) {
  console.log(`  ${b.brand_name} "${b.model_name}" — ${b.category} → step-through`);
}

console.log(`\n[6] Duplicate deactivations (${dupDeactivations.length})`);
for (const b of dupDeactivations) {
  console.log(`  ${b.slug}  →  keep ${DUPLICATE_MERGES[b.slug]}`);
}

console.log('\n═══════════════════════════════════════════');

if (!apply) {
  console.log('\nDry-run only. Re-run with --apply to write changes.');
  await closeBrowser();
  await sql.end();
  process.exit(0);
}

// ─── APPLY ─────────────────────────────────────────────────────────────────
console.log('\n▶ Applying…');
let ops = 0;

// 1. URL repairs
for (const r of urlRepairs) {
  const b = r.bike;
  const newHero = b.hero_image_url || r.newImage;
  const newGallery = b.gallery_images?.length ? b.gallery_images : r.newGallery;
  await sql`
    UPDATE bikes SET
      affiliate_url = ${r.newUrl},
      hero_image_url = ${newHero},
      gallery_images = ${newGallery?.length ? newGallery : null},
      model_name = ${r.newModelName || b.model_name},
      msrp = COALESCE(${r.newMsrp}, msrp),
      updated_at = NOW()
    WHERE id = ${b.id}
  `;
  ops++;
}

// 2. Shopify orphan deactivations
for (const o of shopifyOrphans) {
  await sql`UPDATE bikes SET is_active = false, updated_at = NOW() WHERE id = ${o.bike.id}`;
  ops++;
}

// 3. Trek encoding
for (const t of trekEncodingFixes) {
  await sql`UPDATE bikes SET affiliate_url = ${t.newUrl}, updated_at = NOW() WHERE id = ${t.bike.id}`;
  ops++;
}

// 4. Non-Shopify deactivations
for (const b of nonShopifyDeactivations) {
  const fix = NON_SHOPIFY_FIXES[b.slug];
  if (fix && fix.affiliate_url) {
    await sql`UPDATE bikes SET affiliate_url = ${fix.affiliate_url}, updated_at = NOW() WHERE id = ${b.id}`;
  } else {
    await sql`UPDATE bikes SET is_active = false, updated_at = NOW() WHERE id = ${b.id}`;
  }
  ops++;
}

// 5. Step-through re-categorization
for (const b of recategorizations) {
  await sql`UPDATE bikes SET category = 'step-through', updated_at = NOW() WHERE id = ${b.id}`;
  ops++;
}

// 6. Dup deactivations
for (const b of dupDeactivations) {
  await sql`UPDATE bikes SET is_active = false, updated_at = NOW() WHERE id = ${b.id}`;
  ops++;
}

console.log(`\n✓ ${ops} operations applied.`);

await closeBrowser();
await sql.end();
