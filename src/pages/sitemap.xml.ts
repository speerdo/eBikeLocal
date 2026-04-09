import type { APIRoute } from 'astro';
import sql from '@lib/neon';

export const GET: APIRoute = async ({ site }) => {
  const base = site?.href.replace(/\/$/, '') || 'https://ebikelocal.com';

  // Fetch all dynamic routes
  const [states, cities, shops, brands, bikes, categories] = await Promise.all([
    sql`SELECT slug FROM states`,
    sql`SELECT slug, state_code, (SELECT slug FROM states WHERE code = cities.state_code) as state_slug FROM cities WHERE has_dedicated_page = true`,
    sql`
      SELECT s.slug as shop_slug, c.slug as city_slug, st.slug as state_slug
      FROM shops s
      JOIN cities c ON c.name = s.city AND c.state_code = s.state_code
      JOIN states st ON st.code = s.state_code
      WHERE s.google_business_status IS NULL OR s.google_business_status != 'CLOSED_PERMANENTLY'
    `,
    sql`SELECT slug FROM brands WHERE is_active = true`,
    sql`SELECT bk.slug as model_slug, br.slug as brand_slug FROM bikes bk JOIN brands br ON br.id = bk.brand_id WHERE bk.is_active = true`,
    sql`SELECT slug FROM categories`,
  ]);

  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/shops/', priority: '0.9', changefreq: 'daily' },
    { url: '/brands/', priority: '0.9', changefreq: 'weekly' },
    { url: '/bikes/', priority: '0.8', changefreq: 'weekly' },
    { url: '/categories/', priority: '0.7', changefreq: 'weekly' },
    { url: '/guides/', priority: '0.8', changefreq: 'weekly' },
    { url: '/best/', priority: '0.8', changefreq: 'weekly' },
    { url: '/guides/ebike-laws-by-state/', priority: '0.8', changefreq: 'monthly' },
  ];

  const urls = [
    ...staticPages.map(p => ({ loc: `${base}${p.url}`, priority: p.priority, changefreq: p.changefreq })),
    ...states.map(s => ({ loc: `${base}/shops/${s.slug}/`, priority: '0.8', changefreq: 'weekly' })),
    ...states.map(s => ({ loc: `${base}/guides/ebike-laws/${s.slug}/`, priority: '0.7', changefreq: 'monthly' })),
    ...cities.map(c => ({ loc: `${base}/shops/${c.state_slug}/${c.slug}/`, priority: '0.8', changefreq: 'weekly' })),
    ...shops.map(s => ({ loc: `${base}/shops/${s.state_slug}/${s.city_slug}/${s.shop_slug}/`, priority: '0.6', changefreq: 'monthly' })),
    ...brands.map(b => ({ loc: `${base}/brands/${b.slug}/`, priority: '0.7', changefreq: 'weekly' })),
    ...bikes.map(b => ({ loc: `${base}/bikes/${b.brand_slug}/${b.model_slug}/`, priority: '0.6', changefreq: 'monthly' })),
    ...categories.map(c => ({ loc: `${base}/categories/${c.slug}/`, priority: '0.6', changefreq: 'weekly' })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
