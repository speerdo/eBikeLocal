/**
 * Master scraper runner
 * Runs all brand scrapers sequentially with a delay between each.
 *
 * Usage:
 *   node scripts/scrapers/run-all.mjs              # run all
 *   node scripts/scrapers/run-all.mjs aventon trek  # run specific
 */
import { log, sleep, sql } from './utils.mjs';

const SCRAPERS = {
  aventon:     () => import('./aventon.mjs').then(m => m.scrapeAventon?.() ?? 0),
  lectric:     () => import('./lectric.mjs').then(m => m.scrapeLectric?.() ?? 0),
  velotric:    () => import('./velotric.mjs').then(m => m.scrapeVelotric?.() ?? 0),
  pedego:      () => import('./pedego.mjs').then(m => m.scrapePedego?.() ?? 0),
  rad:         () => import('./rad.mjs').then(m => m.scrapeRad?.() ?? 0),
  trek:        () => import('./trek.mjs').then(m => m.scrapeTrek?.() ?? 0),
  specialized: () => import('./specialized.mjs').then(m => m.scrapeSpecialized?.() ?? 0),
  giant:       () => import('./giant.mjs').then(m => m.scrapeGiant?.() ?? 0),
  locally:     () => import('./locally.mjs').then(m => m.scrapeLocally?.() ?? 0),
  tern:        () => import('./tern.mjs').then(m => m.scrapeTern?.() ?? 0),
};

const requested = process.argv.slice(2);
const toRun = requested.length > 0
  ? requested.filter(name => SCRAPERS[name])
  : Object.keys(SCRAPERS);

if (toRun.length === 0) {
  console.error('No valid scrapers specified. Options:', Object.keys(SCRAPERS).join(', '));
  process.exit(1);
}

log('runner', `Running scrapers: ${toRun.join(', ')}`);
const results = {};

for (const name of toRun) {
  log('runner', `Starting ${name}...`);
  try {
    results[name] = await SCRAPERS[name]();
    log('runner', `${name} complete: ${results[name]} records staged`);
  } catch (err) {
    log('runner', `${name} FAILED: ${err.message}`);
    results[name] = 0;
  }
  if (name !== toRun[toRun.length - 1]) await sleep(5000);
}

console.log('\n=== Scraper Summary ===');
let total = 0;
for (const [name, count] of Object.entries(results)) {
  console.log(`  ${name.padEnd(10)} ${count} records`);
  total += count;
}
console.log(`  ${'TOTAL'.padEnd(10)} ${total} records`);
await sql.end();
process.exit(0);
