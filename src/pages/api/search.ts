export const prerender = false;

import type { APIRoute } from 'astro';
import sql from '@lib/neon';

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ error: 'Query too short' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if query looks like a zip code
  const isZip = /^\d{5}$/.test(q);

  let shops;
  if (isZip) {
    shops = await sql`
      SELECT s.name, s.slug, s.city, s.state_code, s.zip, s.google_rating,
             s.address_line1, s.latitude, s.longitude,
             c.slug as city_slug, st.slug as state_slug
      FROM shops s
      JOIN cities c ON c.name = s.city AND c.state_code = s.state_code
      JOIN states st ON st.code = s.state_code
      WHERE s.zip = ${q}
        AND (s.google_business_status IS NULL OR s.google_business_status != 'CLOSED_PERMANENTLY')
      ORDER BY s.google_rating DESC NULLS LAST
      LIMIT 20
    `;
  } else {
    shops = await sql`
      SELECT s.name, s.slug, s.city, s.state_code, s.zip, s.google_rating,
             s.address_line1, s.latitude, s.longitude,
             c.slug as city_slug, st.slug as state_slug
      FROM shops s
      JOIN cities c ON c.name = s.city AND c.state_code = s.state_code
      JOIN states st ON st.code = s.state_code
      WHERE (
        s.city ILIKE ${'%' + q + '%'}
        OR s.name % ${q}
      )
        AND (s.google_business_status IS NULL OR s.google_business_status != 'CLOSED_PERMANENTLY')
      ORDER BY GREATEST(
        similarity(s.city, ${q}),
        similarity(s.name, ${q})
      ) DESC, s.google_rating DESC NULLS LAST
      LIMIT 20
    `;
  }

  const results = shops.map((s) => ({
    name: s.name,
    address: s.address_line1,
    city: s.city,
    stateCode: s.state_code,
    zip: s.zip,
    rating: s.google_rating ? Number(s.google_rating) : null,
    href: `/shops/${s.state_slug}/${s.city_slug}/${s.slug}/`,
  }));

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
};
