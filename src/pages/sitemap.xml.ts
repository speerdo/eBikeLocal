import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import sql from '@lib/neon';

/** Escape text for XML; safe for & in query strings. */
function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type UrlEntry = { loc: string; changefreq: string; priority: string; lastmod?: string };

export const GET: APIRoute = async ({ site }) => {
  const base = site?.href.replace(/\/$/, '') || 'https://ebikelocal.com';

  const [guideEntries, bestOfEntries, states, cities, shops, brands, bikes, categories] = await Promise.all([
    getCollection('guides'),
    getCollection('bestOf'),
    sql`SELECT slug FROM states`,
    sql`SELECT slug, state_code, (SELECT slug FROM states WHERE code = cities.state_code) as state_slug FROM cities WHERE has_dedicated_page = true`,
    sql`
      SELECT s.slug as shop_slug, c.slug as city_slug, st.slug as state_slug
      FROM shops s
      JOIN cities c ON c.name = s.city AND c.state_code = s.state_code
      JOIN states st ON st.code = s.state_code
      WHERE (s.google_business_status IS NULL OR s.google_business_status != 'CLOSED_PERMANENTLY')
        AND COALESCE(s.listing_status, 'active') = 'active'
    `,
    sql`SELECT slug FROM brands WHERE is_active = true`,
    sql`SELECT bk.slug as model_slug, br.slug as brand_slug FROM bikes bk JOIN brands br ON br.id = bk.brand_id WHERE bk.is_active = true`,
    sql`SELECT slug FROM categories`,
  ]);

  const staticPages: { url: string; changefreq: string; priority: string }[] = [
    { url: '/', changefreq: 'daily', priority: '1.0' },
    { url: '/shops/', changefreq: 'daily', priority: '0.9' },
    { url: '/brands/', changefreq: 'weekly', priority: '0.9' },
    { url: '/bikes/', changefreq: 'weekly', priority: '0.8' },
    { url: '/categories/', changefreq: 'weekly', priority: '0.7' },
    { url: '/guides/', changefreq: 'weekly', priority: '0.8' },
    { url: '/best/', changefreq: 'weekly', priority: '0.8' },
    { url: '/about/', changefreq: 'yearly', priority: '0.4' },
    { url: '/contact/', changefreq: 'yearly', priority: '0.3' },
    { url: '/disclosure/', changefreq: 'yearly', priority: '0.3' },
    { url: '/terms/', changefreq: 'yearly', priority: '0.3' },
    { url: '/privacy/', changefreq: 'yearly', priority: '0.3' },
  ];

  const fromContent: UrlEntry[] = [
    ...guideEntries.map((e) => {
      const d = e.data.updatedAt ?? e.data.publishedAt;
      return {
        loc: `${base}/guides/${e.id}/`,
        changefreq: 'monthly' as const,
        priority: '0.7',
        lastmod: isoDate(d),
      };
    }),
    ...bestOfEntries.map((e) => {
      const d = e.data.updatedAt ?? e.data.publishedAt;
      return {
        loc: `${base}/best/${e.id}/`,
        changefreq: 'monthly' as const,
        priority: '0.7',
        lastmod: isoDate(d),
      };
    }),
  ];

  const fromDb: UrlEntry[] = [
    ...staticPages.map((p) => ({
      loc: `${base}${p.url}`,
      changefreq: p.changefreq,
      priority: p.priority,
    })),
    ...states.map((s) => ({ loc: `${base}/shops/${s.slug}/`, changefreq: 'weekly', priority: '0.8' })),
    ...states.map((s) => ({ loc: `${base}/guides/ebike-laws/${s.slug}/`, changefreq: 'monthly', priority: '0.7' })),
    ...cities.map((c) => ({ loc: `${base}/shops/${c.state_slug}/${c.slug}/`, changefreq: 'weekly', priority: '0.8' })),
    ...shops.map(
      (s) => ({ loc: `${base}/shops/${s.state_slug}/${s.city_slug}/${s.shop_slug}/`, changefreq: 'monthly', priority: '0.6' })
    ),
    ...brands.map((b) => ({ loc: `${base}/brands/${b.slug}/`, changefreq: 'weekly', priority: '0.7' })),
    ...brands.map((b) => ({ loc: `${base}/brands/${b.slug}/dealers/`, changefreq: 'weekly', priority: '0.65' })),
    ...bikes.map((b) => ({ loc: `${base}/bikes/${b.brand_slug}/${b.model_slug}/`, changefreq: 'monthly', priority: '0.6' })),
    ...categories.map((c) => ({ loc: `${base}/categories/${c.slug}/`, changefreq: 'weekly', priority: '0.6' })),
  ];

  // Dedupe (content vs static overlap was removed from static) and order for stable builds
  const byLoc = new Map<string, UrlEntry>();
  for (const u of [...fromDb, ...fromContent]) {
    if (!byLoc.has(u.loc)) byLoc.set(u.loc, u);
  }
  const urls = [...byLoc.values()].sort((a, b) => a.loc.localeCompare(b.loc));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
