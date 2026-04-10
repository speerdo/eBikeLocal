/**
 * Google Places API - Quick connection test
 * Runs a single Text Search + Place Details call to verify key works.
 * Usage: node scripts/scrapers/google-test.mjs
 */
import { env, log } from './utils.mjs';

const API_KEY = env.GOOGLE_PLACES_API_KEY;
const PLACES_BASE = 'https://places.googleapis.com/v1';

async function testTextSearch() {
  log('google-test', 'Testing Places API v2 Text Search...');

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
    },
    body: JSON.stringify({
      textQuery: 'electric bike shop',
      includedType: 'bicycle_store',
      locationBias: {
        circle: {
          center: { latitude: 37.7749, longitude: -122.4194 }, // San Francisco
          radius: 10000,
        },
      },
      maxResultCount: 5,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Text Search failed ${res.status}: ${err}`);
  }

  const data = await res.json();
  const places = data.places || [];
  log('google-test', `Text Search OK — ${places.length} results`);
  for (const p of places) {
    console.log(`  • ${p.displayName?.text} | ${p.formattedAddress} | types: ${p.types?.slice(0, 3).join(', ')}`);
  }
  return places[0]?.id;
}

async function testPlaceDetails(placeId) {
  if (!placeId) { log('google-test', 'No place ID to test details with, skipping.'); return; }

  log('google-test', `Testing Place Details for ${placeId}...`);

  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': [
        'id', 'displayName', 'formattedAddress', 'location',
        'nationalPhoneNumber', 'websiteUri', 'rating', 'userRatingCount',
        'currentOpeningHours', 'regularOpeningHours',
        'editorialSummary', 'types', 'photos',
      ].join(','),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Place Details failed ${res.status}: ${err}`);
  }

  const place = await res.json();
  log('google-test', 'Place Details OK');
  console.log('  Name:    ', place.displayName?.text);
  console.log('  Address: ', place.formattedAddress);
  console.log('  Phone:   ', place.nationalPhoneNumber || '(none)');
  console.log('  Website: ', place.websiteUri || '(none)');
  console.log('  Rating:  ', place.rating ? `${place.rating} (${place.userRatingCount} reviews)` : '(none)');
  console.log('  Hours:   ', place.regularOpeningHours?.weekdayDescriptions?.slice(0, 2).join('; ') || '(none)');
  console.log('  Summary: ', place.editorialSummary?.text || '(none)');
  console.log('  Photos:  ', place.photos?.length || 0, 'available');
}

try {
  if (!API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not set in .env');
  log('google-test', `API key loaded (${API_KEY.slice(0, 8)}...)`);

  const placeId = await testTextSearch();
  await testPlaceDetails(placeId);

  log('google-test', 'All tests passed. API key is working.');
} catch (err) {
  console.error('[google-test] FAILED:', err.message);
  process.exit(1);
}
