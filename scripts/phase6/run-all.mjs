/**
 * Phase 6 — Full Pipeline Orchestrator
 *
 * Runs all 4 Phase 6 workstreams in the correct dependency order:
 *
 *   1. deduplication      — promote google_places_raw + staging_shops → shops
 *   2. classify-ebike     — compute ebike_confidence_score for every shop
 *   3. populate-shop-brands — fill shop_brands junction table
 *   4. populate-geography — populate cities table, update shop/state counts
 *
 * Usage:
 *   node scripts/phase6/run-all.mjs                    # run everything
 *   node scripts/phase6/run-all.mjs --dry-run          # dry run all steps
 *   node scripts/phase6/run-all.mjs --step dedup       # run one step only
 *   node scripts/phase6/run-all.mjs --step classify
 *   node scripts/phase6/run-all.mjs --step shop-brands
 *   node scripts/phase6/run-all.mjs --step geography
 *   node scripts/phase6/run-all.mjs --report           # print stats for all steps
 *
 * Notes:
 *   - Pass --website-check to classify-ebike for website content scoring (+0.20)
 *   - Pass --apply-filter to mark shops with score < 0.5 as inactive
 */

import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry-run')      ? ['--dry-run']      : [];
const REPORT_ONLY  = args.includes('--report')        ? ['--report']       : [];
const WEBSITE_CHK  = args.includes('--website-check') ? ['--website-check'] : [];
const APPLY_FILTER = args.includes('--apply-filter')  ? ['--apply-filter'] : [];
const STEP_IDX     = args.indexOf('--step');
const STEP         = STEP_IDX !== -1 ? args[STEP_IDX + 1] : null;

const STEPS = [
  {
    id: 'dedup',
    label: 'Workstream 1: Deduplication',
    script: join(__dirname, 'deduplication.mjs'),
    extraArgs: [],
  },
  {
    id: 'classify',
    label: 'Workstream 2: eBike Classification',
    script: join(__dirname, 'classify-ebike.mjs'),
    extraArgs: [...WEBSITE_CHK, ...APPLY_FILTER],
  },
  {
    id: 'shop-brands',
    label: 'Workstream 3: Shop-Brand Junction',
    script: join(__dirname, 'populate-shop-brands.mjs'),
    extraArgs: [],
  },
  {
    id: 'geography',
    label: 'Workstream 4: Geographic Data',
    script: join(__dirname, 'populate-geography.mjs'),
    extraArgs: [],
  },
];

function runStep(step) {
  const extraArgs = REPORT_ONLY.length
    ? ['--report']
    : [...DRY_RUN, ...step.extraArgs];

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Phase 6 — ${step.label}`);
  console.log(`${'═'.repeat(60)}\n`);

  execFileSync(
    process.execPath,
    [step.script, ...extraArgs],
    { stdio: 'inherit' }
  );
}

const stepsToRun = STEP
  ? STEPS.filter(s => s.id === STEP)
  : STEPS;

if (stepsToRun.length === 0) {
  console.error(`Unknown step: "${STEP}". Valid: ${STEPS.map(s => s.id).join(', ')}`);
  process.exit(1);
}

console.log(`\nPhase 6 Pipeline — ${stepsToRun.length} step(s)`);
if (DRY_RUN.length) console.log('Mode: DRY RUN');
if (REPORT_ONLY.length) console.log('Mode: REPORT ONLY');

const start = Date.now();

for (const step of stepsToRun) {
  runStep(step);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Phase 6 complete in ${elapsed}s`);
console.log(`${'═'.repeat(60)}\n`);
