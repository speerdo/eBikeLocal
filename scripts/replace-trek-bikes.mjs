/**
 * Removes all bikes for brand slug `trek`, then runs `seed-bikes.mjs` so Trek rows
 * match `scripts/seed-bikes.mjs` (currently Domane+ ALR 5, Powerfly+ FS 4 Gen 4, FX+ 1 Midstep).
 *
 * Run: node scripts/replace-trek-bikes.mjs
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const env = Object.fromEntries(
  envFile
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const sql = postgres(env.DATABASE_URL, { ssl: 'require' });

const removed = await sql`
  DELETE FROM bikes
  WHERE brand_id = (SELECT id FROM brands WHERE slug = 'trek')
  RETURNING id
`;
console.log(`Removed ${removed.length} Trek bike row(s).`);
await sql.end();

const res = spawnSync(process.execPath, [join(__dirname, 'seed-bikes.mjs')], {
  stdio: 'inherit',
  cwd: join(__dirname, '..'),
});
process.exit(res.status ?? 1);
