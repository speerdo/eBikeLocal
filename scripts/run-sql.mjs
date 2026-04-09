/**
 * Generic SQL runner — pass a .sql file as argument
 * Usage: node scripts/run-sql.mjs scripts/add-staging-table.sql
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const envVars = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => { const idx = line.indexOf('='); return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]; })
);

const sqlFile = process.argv[2];
if (!sqlFile) { console.error('Usage: node scripts/run-sql.mjs <file.sql>'); process.exit(1); }

const sql = postgres(envVars.DATABASE_URL, { ssl: 'require' });
const schema = readFileSync(resolve(sqlFile), 'utf-8');
const statements = schema.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  .split(';').map(s => s.trim()).filter(s => s.length > 0);

for (const stmt of statements) {
  try {
    await sql.unsafe(stmt);
    console.log('✓', stmt.slice(0, 80).replace(/\s+/g, ' '));
  } catch (err) {
    console.error('✗', stmt.slice(0, 80).replace(/\s+/g, ' '), '\n ', err.message);
  }
}
await sql.end();
console.log('\nDone.');
