/**
 * Stock image registry — Pexels free-to-use images.
 * All images are free under the Pexels License (no attribution required,
 * but we include photographer credit where shown as good practice).
 *
 * CDN URL pattern:
 *   https://images.pexels.com/photos/{id}/pexels-photo-{id}.jpeg?auto=compress&cs=tinysrgb&w={w}&h={h}&dpr=1
 */

export interface PexelsImage {
  id: number;
  description: string;
  photographer: string;
  pexelsUrl: string;
}

/** Build a Pexels CDN URL at a given width (height auto-scales). */
export function pexelsUrl(id: number, width = 1200): string {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}&dpr=1`;
}

/** Build a Pexels CDN URL at an exact width+height (crops to fill). */
export function pexelsCrop(id: number, width: number, height: number): string {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}&h=${height}&fit=crop&dpr=1`;
}

// ── Image library ─────────────────────────────────────────────────────────

export const IMAGES = {
  // Riding / lifestyle
  manRidingEbikeSideView: {
    id: 13344226,
    description: 'Side view of a man riding an electric bicycle on a sunny day',
    photographer: 'tal molcho',
    pexelsUrl: 'https://www.pexels.com/photo/side-view-of-a-man-riding-an-electric-bicycle-13344226/',
  },
  manInBlackShirtOnEbike: {
    id: 15021419,
    description: 'Man in black shirt riding an electric bike near a waterfront',
    photographer: 'Team EVELO',
    pexelsUrl: 'https://www.pexels.com/photo/man-in-black-shirt-riding-an-electric-bike-15021419/',
  },
  coupleRidingStreet: {
    id: 15020561,
    description: 'A couple riding their electric bikes down a sunny street',
    photographer: 'Team EVELO',
    pexelsUrl: 'https://www.pexels.com/photo/a-couple-riding-their-bikes-down-a-street-15020561/',
  },
  sunsetWomanOnHill: {
    id: 15206179,
    description: 'Sunset and sunlight over woman with electric bike on scenic hill above village',
    photographer: 'Julia Volk',
    pexelsUrl: 'https://www.pexels.com/photo/sunset-sunlight-over-woman-with-electric-bike-on-barren-hill-over-village-15206179/',
  },

  // Women with eBikes
  womanHoldingEbike: {
    id: 13738395,
    description: 'Woman holding an electric bike — smiling outdoors',
    photographer: 'G-FORCE Bike',
    pexelsUrl: 'https://www.pexels.com/photo/woman-holding-an-electric-bike-13738395/',
  },
  womanSittingBesideEbike: {
    id: 13738396,
    description: 'Woman in casual attire sitting beside an electric bike on a sunny day',
    photographer: 'G-FORCE Bike',
    pexelsUrl: 'https://www.pexels.com/photo/a-woman-sitting-beside-an-electric-bike-13738396/',
  },

  // Product shots
  blackEbikeOnFloor: {
    id: 15020749,
    description: 'Black electric bike parked on tiled floor with Seattle waterfront background',
    photographer: 'Team EVELO',
    pexelsUrl: 'https://www.pexels.com/photo/black-electric-bike-on-tiled-floor-15020749/',
  },
  closeUpBlackEbike: {
    id: 12265482,
    description: 'Close-up of a sleek black electric bicycle with blurred background',
    photographer: 'G-FORCE Bike',
    pexelsUrl: 'https://www.pexels.com/photo/close-up-of-a-black-electric-bicycle-12265482/',
  },
  ebikeInGrass: {
    id: 15009900,
    description: 'A black and white electric bike sitting in the grass',
    photographer: 'Team EVELO',
    pexelsUrl: 'https://www.pexels.com/photo/a-black-and-white-electric-bike-sitting-in-the-grass-15009900/',
  },
  modernEbikeOnPathway: {
    id: 7650393,
    description: 'Modern electric bike leaned on a railing on a paved pathway',
    photographer: 'Los Muertos Crew',
    pexelsUrl: 'https://www.pexels.com/photo/modern-electric-bike-on-pathway-7650393/',
  },

  // Cargo
  electricCargoBike: {
    id: 31638920,
    description: 'Green electric cargo bike with delivery parcels at a post office',
    photographer: 'Jean Fourche',
    pexelsUrl: 'https://www.pexels.com/photo/electric-cargo-bike-at-french-post-office-31638920/',
  },

  // Mountain / trail
  mountainBikerTrail: {
    id: 90454,
    description: 'Man in cycling gear riding a green off-road mountain bike on a trail',
    photographer: 'Pixabay',
    pexelsUrl: 'https://www.pexels.com/photo/man-in-black-and-orange-bicycle-riding-jacket-with-green-off-road-bike-90454/',
  },
} as const;

// ── Page-level image assignments ──────────────────────────────────────────

/** Hero images for key page types. */
export const PAGE_IMAGES = {
  homepageHero:        IMAGES.manRidingEbikeSideView,
  guidesHub:           IMAGES.sunsetWomanOnHill,
  bestOfHub:           IMAGES.coupleRidingStreet,
  howToChoose:         IMAGES.womanHoldingEbike,
  ebikeClasses:        IMAGES.manInBlackShirtOnEbike,
  whatToLookFor:       IMAGES.blackEbikeOnFloor,
  bestUnder1000:       IMAGES.closeUpBlackEbike,
  bestUnder1500:       IMAGES.modernEbikeOnPathway,
  bestUnder2000:       IMAGES.coupleRidingStreet,
  bestUnder2500:       IMAGES.womanSittingBesideEbike,
  bestUnder3000:       IMAGES.sunsetWomanOnHill,
  cargoGuide:          IMAGES.electricCargoBike,
  mountainGuide:       IMAGES.mountainBikerTrail,
  taxCreditGuide:      IMAGES.manRidingEbikeSideView,
  lawsGuide:           IMAGES.ebikeInGrass,
} as const;
