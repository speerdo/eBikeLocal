type BrandLogoInput = {
  slug?: string | null;
  logo_url?: string | null;
  website?: string | null;
};

const CLEARBIT_LOGO_BASE = 'https://logo.clearbit.com';
const LOCAL_BRAND_LOGOS: Record<string, string> = {
  aventon: '/logos/brands/aventon.png',
  trek: '/logos/brands/trek.svg',
  specialized: '/logos/brands/specialized.svg',
  giant: '/logos/brands/giant.svg',
  'rad-power-bikes': '/logos/brands/rad-power-bikes.png',
  velotric: '/logos/brands/velotric.png',
  cannondale: '/logos/brands/cannondale.svg',
  lectric: '/logos/brands/lectric.png',
  pedego: '/logos/brands/pedego.png',
  tern: '/logos/brands/tern.png',
  gazelle: '/logos/brands/gazelle.svg',
  himiway: '/logos/brands/himiway.svg',
  ride1up: '/logos/brands/ride1up.svg',
  evelo: '/logos/brands/evelo.png',
  quietkat: '/logos/brands/quietkat.png',
};

function getRootDomain(website?: string | null): string | null {
  if (!website) return null;

  try {
    const hostname = new URL(website).hostname.trim().toLowerCase();
    if (!hostname) return null;
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return null;
  }
}

export function getBrandLogoUrl(brand: BrandLogoInput): string | null {
  if (brand.slug) {
    const localLogo = LOCAL_BRAND_LOGOS[brand.slug];
    if (localLogo) return localLogo;
  }

  if (brand.logo_url) return brand.logo_url;

  const domain = getRootDomain(brand.website);
  if (!domain) return null;

  return `${CLEARBIT_LOGO_BASE}/${domain}?size=256`;
}
