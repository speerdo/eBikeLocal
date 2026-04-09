/**
 * Shared scraper utilities: DB connection, rate limiting, robots.txt,
 * address normalization, slug generation, and staging insertion.
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── DB connection ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '..', '.env'), 'utf-8');
export const env = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => { const idx = line.indexOf('='); return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]; })
);

export const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 5 });

// ── Rate limiter ─────────────────────────────────────────────────────────────

const lastRequestTime = {};

/**
 * Sleep at least `minMs` ms since the last request to `domain`.
 * Defaults to 1000ms (1 req/sec) per domain.
 */
export async function rateLimit(domain, minMs = 1000) {
  const now = Date.now();
  const last = lastRequestTime[domain] || 0;
  const wait = Math.max(0, minMs - (now - last));
  if (wait > 0) await sleep(wait);
  lastRequestTime[domain] = Date.now();
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Robots.txt checker ───────────────────────────────────────────────────────

const robotsCache = {};

export async function isAllowed(url, userAgent = 'eBikeLocalBot') {
  const { origin } = new URL(url);
  if (!robotsCache[origin]) {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(5000),
      });
      robotsCache[origin] = res.ok ? await res.text() : '';
    } catch {
      robotsCache[origin] = ''; // allow if robots.txt unreachable
    }
  }

  const txt = robotsCache[origin];
  if (!txt) return true;

  const path = new URL(url).pathname;
  const lines = txt.split('\n').map(l => l.trim());
  let inOurBlock = false;
  let disallowed = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('user-agent:')) {
      const agent = line.split(':')[1].trim();
      inOurBlock = agent === '*' || agent.toLowerCase().includes('ebikelocalbot');
    }
    if (inOurBlock && line.toLowerCase().startsWith('disallow:')) {
      const disallowPath = line.split(':')[1].trim();
      if (disallowPath && path.startsWith(disallowPath)) {
        disallowed = true;
      }
    }
  }
  return !disallowed;
}

// ── Address normalization ────────────────────────────────────────────────────

const STATE_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

export function toStateCode(state) {
  if (!state) return null;
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_ABBR[s] || null;
}

export function normalizeAddress(addr) {
  if (!addr) return '';
  return addr
    .toLowerCase()
    .replace(/\bsuite\b\.?\s*#?\d+/gi, '')
    .replace(/\bste\b\.?\s*#?\d+/gi, '')
    .replace(/\bunit\b\.?\s*#?\d+/gi, '')
    .replace(/\bfloor\b\.?\s*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();
}

// ── Slug generation ──────────────────────────────────────────────────────────

export function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function shopSlug(name, city, stateCode) {
  return toSlug(`${name} ${city} ${stateCode}`).slice(0, 100);
}

// ── Staging insertion ────────────────────────────────────────────────────────

/**
 * Insert a raw scraped record into the staging table.
 * Skips if already present (same source + source_id).
 */
export async function stageRecord(record) {
  const {
    source, sourceId, rawData, name, address, city, state, stateCode,
    zip, latitude, longitude, phone, website, email,
    brandName, dealerTier,
  } = record;

  try {
    await sql`
      INSERT INTO staging_shops (
        source, source_id, raw_data, name, address, city, state, state_code,
        zip, latitude, longitude, phone, website, email, brand_name, dealer_tier
      ) VALUES (
        ${source}, ${sourceId || null}, ${rawData}, ${name || null},
        ${address || null}, ${city || null}, ${state || null}, ${stateCode || null},
        ${zip || null}, ${latitude || null}, ${longitude || null},
        ${phone || null}, ${website || null}, ${email || null},
        ${brandName || null}, ${dealerTier || null}
      )
      ON CONFLICT DO NOTHING
    `;
    return true;
  } catch (err) {
    console.error(`[staging] Failed to insert ${name}:`, err.message);
    return false;
  }
}

// ── Playwright launcher ──────────────────────────────────────────────────────

export async function launchBrowser() {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}

export async function newPage(browser) {
  const ctx = await browser.newContext({
    userAgent: 'eBikeLocalBot/1.0 (+https://ebikelocal.com/bot)',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  return ctx.newPage();
}

// ── Progress logging ─────────────────────────────────────────────────────────

export function log(source, msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${source}] ${msg}`);
}
