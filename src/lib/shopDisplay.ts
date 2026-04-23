/**
 * Helpers for shop listing pages: Google Places opening hours shape + fallback copy.
 */

export type OpeningHoursRow = { day: string; hours: string };

const GOOGLE_HOURS_METADATA_KEYS = new Set([
  'openNow',
  'periods',
  'nextCloseTime',
  'weekdayDescriptions',
]);

/**
 * Maps `regularOpeningHours` from Places API (stored in shops.opening_hours) to table rows.
 */
export function getOpeningHoursRows(openingHours: unknown): OpeningHoursRow[] | null {
  if (openingHours == null || typeof openingHours !== 'object' || Array.isArray(openingHours)) {
    return null;
  }

  const o = openingHours as Record<string, unknown>;
  const wd = o.weekdayDescriptions;

  if (Array.isArray(wd) && wd.length > 0) {
    const rows: OpeningHoursRow[] = [];
    for (const line of wd) {
      if (typeof line !== 'string') continue;
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(': ');
      if (idx === -1) {
        rows.push({ day: trimmed, hours: '' });
      } else {
        rows.push({
          day: trimmed.slice(0, idx).trim(),
          hours: trimmed.slice(idx + 2).trim(),
        });
      }
    }
    return rows.length > 0 ? rows : null;
  }

  // Legacy flat map { Monday: "9–5", ... }
  const legacy: OpeningHoursRow[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (GOOGLE_HOURS_METADATA_KEYS.has(k)) continue;
    if (typeof v === 'string' && v.trim()) {
      legacy.push({ day: k, hours: v.trim() });
    }
  }
  return legacy.length > 0 ? legacy : null;
}

function formatBrandList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * Prefer Google editorial summary; otherwise compose a useful blurb from directory fields.
 */
export function buildShopAboutText(input: {
  name: string;
  city: string;
  stateCode: string;
  editorialDescription: string | null | undefined;
  descriptionGenerated?: boolean;
  isEbikeSpecialist: boolean;
  services: string[] | null | undefined;
  brandNames: string[];
  rating?: number | null;
  reviewCount?: number | null;
  openingHours?: unknown;
}): string {
  const editorial = input.editorialDescription?.trim();
  if (editorial && !input.descriptionGenerated) return editorial;

  const parts: string[] = [];
  const compactBrands = input.brandNames.filter(Boolean).slice(0, 3);
  const hasHighRating =
    typeof input.rating === 'number'
    && input.rating >= 4.5
    && typeof input.reviewCount === 'number'
    && input.reviewCount >= 50;
  const openDays = getOpeningHoursRows(input.openingHours)?.length ?? 0;
  const openMostDays = openDays >= 6;
  const variantSeed = (input.name.length + input.city.length + input.stateCode.length) % 4;

  if (compactBrands.length > 0) {
    const brandList = formatBrandList(compactBrands);
    if (variantSeed === 0) {
      parts.push(`${input.name} is an authorized ${brandList} dealer in ${input.city}, ${input.stateCode}.`);
    } else if (variantSeed === 1) {
      parts.push(`In ${input.city}, ${input.stateCode}, ${input.name} carries ${brandList} and supports riders with in-store help.`);
    } else if (variantSeed === 2) {
      parts.push(`${input.name} serves cyclists in ${input.city}, ${input.stateCode} as an authorized ${brandList} dealer.`);
    } else {
      parts.push(`Riders in ${input.city}, ${input.stateCode} can find ${brandList} bikes and service at ${input.name}.`);
    }
  } else if (variantSeed % 2 === 0) {
    parts.push(`${input.name} is a local bike shop in ${input.city}, ${input.stateCode} offering sales, service, and accessories.`);
  } else {
    parts.push(`${input.name} offers bike sales, repairs, and accessories in ${input.city}, ${input.stateCode}.`);
  }

  if (hasHighRating) {
    parts.push(`One of ${input.city}'s top-rated bike shops with a ${input.rating!.toFixed(1)} star rating across ${input.reviewCount} reviews.`);
  }

  if (openMostDays) {
    parts.push(`Open ${openDays} days a week, ${input.name} helps riders with bike setup, maintenance, and ongoing service support.`);
  }

  if (input.isEbikeSpecialist) {
    parts.push('The shop focuses on electric bikes and related expertise.');
  }

  if (input.brandNames.length > 3) {
    parts.push(`Additional carried brands include ${input.brandNames.slice(3, 6).join(', ')}${input.brandNames.length > 6 ? ', and others' : ''}.`);
  }

  if (input.services && input.services.length > 0) {
    const shown = input.services.slice(0, 8);
    const more = input.services.length > 8;
    parts.push(
      `Services include ${shown.join(', ')}${more ? ', and more' : ''}.`
    );
  }

  parts.push('Contact the store for current inventory, pricing, and service availability.');

  return parts.join(' ');
}

export function truncateForMetaDescription(text: string, max = 158): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const base = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return `${base}…`;
}
