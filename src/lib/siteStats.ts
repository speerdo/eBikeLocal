import sql from '@lib/neon';

export type SiteStats = {
  shopCount: number;
  brandCount: number;
  cityPageCount: number;
};

/** Live aggregates for marketing copy and stat bars (same filters as directory listings). */
export async function getSiteStats(): Promise<SiteStats> {
  const [shopRows, brandRows, cityRows] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM shops WHERE (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY') AND COALESCE(listing_status, 'active') = 'active'`,
    sql`SELECT COUNT(*)::int AS count FROM brands WHERE is_active = true`,
    sql`SELECT COUNT(*)::int AS count FROM cities WHERE has_dedicated_page = true`,
  ]);

  return {
    shopCount: Number(shopRows[0]?.count ?? 0),
    brandCount: Number(brandRows[0]?.count ?? 0),
    cityPageCount: Number(cityRows[0]?.count ?? 0),
  };
}
