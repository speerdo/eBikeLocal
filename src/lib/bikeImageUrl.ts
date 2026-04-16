/**
 * Normalize bike product image URLs for <img src>.
 * Scraped og:image values are often protocol-relative (//cdn...) or path-relative (/files/...).
 */

import curatedBikeHeroImages from '../data/bike-hero-images.json';
import brandHeroFallbacks from '../data/bike-brand-hero-fallbacks.json';
import { IMAGES, pexelsUrl } from './images';

const CURATED = curatedBikeHeroImages as Record<string, string>;
const BRAND_HERO = brandHeroFallbacks as Record<string, string>;

/** Lifestyle / product-adjacent eBike stock shots — large pool so cards rarely repeat the same photo. */
const STOCK_PEXELS_IDS = [
  IMAGES.manRidingEbikeSideView.id,
  IMAGES.manInBlackShirtOnEbike.id,
  IMAGES.coupleRidingStreet.id,
  IMAGES.sunsetWomanOnHill.id,
  IMAGES.womanHoldingEbike.id,
  IMAGES.womanSittingBesideEbike.id,
  IMAGES.blackEbikeOnFloor.id,
  IMAGES.closeUpBlackEbike.id,
  IMAGES.ebikeInGrass.id,
  IMAGES.modernEbikeOnPathway.id,
  IMAGES.electricCargoBike.id,
  IMAGES.mountainBikerTrail.id,
];

function stockHeroForSlug(
  slug: string,
  brandSlug: string | null | undefined,
  width: number
): string {
  const key = `${brandSlug || 'bike'}:${slug}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const id = STOCK_PEXELS_IDS[h % STOCK_PEXELS_IDS.length];
  return pexelsUrl(id, width);
}

/** Last-resort stock (Pexels) — hash uses brand + slug so adjacent cards differ more. */
export function bikeStockHeroUrl(
  slug: string | null | undefined,
  brandSlug?: string | null
): string {
  return stockHeroForSlug(slug?.trim() || 'bike', brandSlug?.trim() || null, 900);
}

function decodeCommonEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * Resolve a remote image URL for use in the browser. Returns null if the value cannot be resolved.
 */
export function normalizeRemoteImageUrl(
  raw: string | null | undefined,
  basePageUrl?: string | null
): string | null {
  if (raw == null) return null;
  let s = decodeCommonEntities(String(raw).trim());
  if (!s || s.startsWith('data:')) return null;

  if (s.startsWith('//')) {
    s = `https:${s}`;
  } else if (/^https?:\/\//i.test(s)) {
    // absolute URL — ok
  } else if (s.startsWith('/')) {
    // local server path (e.g. /images/bikes/foo.jpg) — use as-is
    return s;
  } else if (!/^[\w+.-]+:/.test(s)) {
    if (!basePageUrl?.trim()) return null;
    try {
      s = new URL(s, basePageUrl).href;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (!/^https?:\/\//i.test(s)) return null;
  try {
    new URL(s);
  } catch {
    return null;
  }
  return s;
}

/** Representative product-style hero for a brand when model slug is unknown (extra DB rows). */
export function bikeBrandHeroFallbackUrl(brandSlug: string | null | undefined): string | null {
  const b = brandSlug?.trim();
  if (!b || !BRAND_HERO[b]) return null;
  return normalizeRemoteImageUrl(BRAND_HERO[b], null);
}

export function pickBikeHeroImageUrl(input: {
  slug?: string | null;
  /** Brand row slug (e.g. rad-power-bikes) — brand-level product fallback */
  brandSlug?: string | null;
  heroImageUrl?: string | null;
  galleryImages?: string[] | null;
  affiliateUrl?: string | null;
}): string | null {
  const base = input.affiliateUrl?.trim() || null;
  const slug = input.slug?.trim();
  const brandSlug = input.brandSlug?.trim() || null;

  // 1. Curated overrides (only populated if we have a real product image)
  if (slug && CURATED[slug]) {
    const n = normalizeRemoteImageUrl(CURATED[slug], null);
    if (n) return n;
  }

  // 2. DB hero image or gallery
  for (const c of [input.heroImageUrl, ...(input.galleryImages ?? [])]) {
    const n = normalizeRemoteImageUrl(c, base);
    if (n) return n;
  }

  // 3. Brand-level product fallback (only for brands with real downloaded images)
  if (brandSlug && BRAND_HERO[brandSlug]) {
    const n = normalizeRemoteImageUrl(BRAND_HERO[brandSlug], null);
    if (n) return n;
  }

  // No real product image found — let the card show its SVG placeholder
  return null;
}

export function normalizeGalleryImageUrls(
  gallery: string[] | null | undefined,
  basePageUrl?: string | null
): string[] {
  if (!gallery?.length) return [];
  const base = basePageUrl?.trim() || null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of gallery) {
    const n = normalizeRemoteImageUrl(raw, base);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
