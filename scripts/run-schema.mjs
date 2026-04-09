import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const envVars = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const sql = postgres(envVars.DATABASE_URL, { ssl: 'require' });

try {
  // Test connection
  const [result] = await sql`SELECT 1 AS connected`;
  console.log('Connected to Neon:', result);

  // Run schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

  // Strip comment-only lines, then split on semicolons
  const cleaned = schema
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleaned
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await sql.unsafe(stmt);
      // Log just the first line of each statement
      const firstLine = stmt.split('\n').find(l => l.trim() && !l.trim().startsWith('--')) || stmt.slice(0, 60);
      console.log('✓', firstLine.trim().slice(0, 80));
    } catch (err) {
      console.error('✗', stmt.slice(0, 60), '\n  Error:', err.message);
    }
  }

  console.log('\nSchema setup complete!');
} catch (err) {
  console.error('Connection failed:', err.message);
} finally {
  await sql.end();
}
