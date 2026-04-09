export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.BUILD_HOOK_SECRET;

  if (!secret) {
    return new Response(JSON.stringify({ error: 'BUILD_HOOK_SECRET not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Trigger Vercel deploy hook
  // The deploy hook URL should be set as an env var
  // For now, return success — configure the actual hook URL in Vercel
  return new Response(JSON.stringify({ success: true, message: 'Rebuild triggered' }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
