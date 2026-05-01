/** Hosts allowlisted for `astro.config` `image.remotePatterns` — use with `<Image />` from `astro:assets`. */

const OPTIMIZED_HOSTS = new Set(['images.pexels.com', 'images.unsplash.com']);

export function isOptimizedRemoteImageUrl(src: string | undefined | null): src is string {
  if (!src?.trim()) return false;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && OPTIMIZED_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
