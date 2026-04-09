export const prerender = false;

import type { APIRoute } from 'astro';
import sql from '@lib/neon';

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Suggest cities and shops matching the query
  const cities = await sql`
    SELECT c.name, c.slug, c.state_code, c.shop_count, st.slug as state_slug
    FROM cities c
    JOIN states st ON st.code = c.state_code
    WHERE c.name ILIKE ${q + '%'} AND c.has_dedicated_page = true
    ORDER BY c.shop_count DESC
    LIMIT 5
  `;

  const shops = await sql`
    SELECT s.name, s.slug, s.city, s.state_code,
           c.slug as city_slug, st.slug as state_slug
    FROM shops s
    JOIN cities c ON c.name = s.city AND c.state_code = s.state_code
    JOIN states st ON st.code = s.state_code
    WHERE s.name ILIKE ${'%' + q + '%'}
      AND (s.google_business_status IS NULL OR s.google_business_status != 'CLOSED_PERMANENTLY')
    ORDER BY s.google_rating DESC NULLS LAST
    LIMIT 5
  `;

  const results = [
    ...cities.map((c) => ({
      label: `${c.name}, ${c.state_code} (${c.shop_count} shops)`,
      href: `/shops/${c.state_slug}/${c.slug}/`,
      type: 'city',
    })),
    ...shops.map((s) => ({
      label: `${s.name} — ${s.city}, ${s.state_code}`,
      href: `/shops/${s.state_slug}/${s.city_slug}/${s.slug}/`,
      type: 'shop',
    })),
  ];

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
};
