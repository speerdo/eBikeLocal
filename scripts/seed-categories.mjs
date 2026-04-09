/**
 * Seeds the `categories` table with the 10 primary eBike categories.
 * Run: node scripts/seed-categories.mjs
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sql = postgres(env.DATABASE_URL, { ssl: 'require' });

const categories = [
  { name: 'Commuter / City', slug: 'commuter', icon: '🏙️', sort_order: 1, description: 'Designed for daily transportation. Typically lighter frames, integrated lights and fenders, and moderate range. The largest eBike market segment.' },
  { name: 'Cruiser', slug: 'cruiser', icon: '🏖️', sort_order: 2, description: 'Beach and leisure-style eBikes with upright riding positions and comfort-focused geometry. Popular with older demographics. Brands like Pedego and Electric Bike Company specialize here.' },
  { name: 'Cargo', slug: 'cargo', icon: '📦', sort_order: 3, description: 'Extended frames or longtails designed for hauling kids, groceries, and gear. A rapidly growing segment. Notable models include the Tern GSD, Rad Power RadWagon, and Aventon Abound.' },
  { name: 'Folding', slug: 'folding', icon: '🔀', sort_order: 4, description: 'Compact, foldable eBikes ideal for apartment storage and multimodal commuting. Popular models include the Lectric XP, Tern Vektron, and Brompton Electric.' },
  { name: 'Mountain / eMTB', slug: 'mountain', icon: '⛰️', sort_order: 5, description: 'Full suspension, knobby tires, designed for trail riding. The premium eBike segment. Top picks include the Specialized Turbo Levo and Trek Powerfly.' },
  { name: 'Fat Tire', slug: 'fat-tire', icon: '🛞', sort_order: 6, description: '4"+ tires for sand, snow, and all-terrain riding. Very popular in the DTC and budget segments. Notable brands: Himiway, Aventon Aventure.' },
  { name: 'Road / Gravel', slug: 'road-gravel', icon: '🚴', sort_order: 7, description: 'Drop-bar, lightweight eBikes designed for long road and gravel rides. A smaller niche. Notable models: Giant Defy Advanced E+, Specialized Turbo Creo.' },
  { name: 'Moped-Style', slug: 'moped-style', icon: '🛵', sort_order: 8, description: 'Motorcycle-inspired aesthetics with Class 2 throttle. Popular with urban riders. Notable brands: Super73, Juiced Bikes.' },
  { name: 'Hunting / Off-Road', slug: 'hunting', icon: '🌲', sort_order: 9, description: 'Camo patterns, high payload capacity, designed for hunters and outdoor workers. Dominated by QuietKat.' },
  { name: 'Step-Through', slug: 'step-through', icon: '🚲', sort_order: 10, description: 'Low step-over frame for easy mounting. Popular with older riders and those with mobility concerns. Brands: Gazelle, Pedego.' },
];

console.log(`Seeding ${categories.length} categories...`);
let count = 0;
for (const cat of categories) {
  try {
    await sql`
      INSERT INTO categories (name, slug, icon, sort_order, description)
      VALUES (${cat.name}, ${cat.slug}, ${cat.icon}, ${cat.sort_order}, ${cat.description})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        icon = EXCLUDED.icon,
        sort_order = EXCLUDED.sort_order,
        description = EXCLUDED.description
    `;
    console.log(`✓ ${cat.name}`);
    count++;
  } catch (err) {
    console.error(`✗ ${cat.name}: ${err.message}`);
  }
}

console.log(`\nSeeded ${count} categories.`);
await sql.end();
