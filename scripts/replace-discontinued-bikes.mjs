/**
 * Removes 5 discontinued bikes and inserts their 2025/2026 replacements.
 *
 * REMOVED (discontinued / no accessible product image):
 *   - Cannondale Adventure Neo 3
 *   - Giant Explore E+ 1
 *   - Giant FastRoad E+ 1 Pro
 *   - Rad Power Bikes RadCity 5 Plus
 *   - Rad Power Bikes RadRover 6 Plus
 *
 * ADDED (current model-year equivalents):
 *   - Cannondale Adventure Neo Allroad EQ (2025)
 *   - Giant Explore E+ 2 STA (2026)
 *   - Giant FastRoad E+ EX Pro (2025)
 *   - Rad Power Bikes Radster Road (2025)
 *   - Rad Power Bikes Radster Trail (2025)
 *
 * Run: node scripts/replace-discontinued-bikes.mjs
 */

import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sql = postgres(env.DATABASE_URL, { ssl: 'require' });
const OUT = join(__dirname, '..', 'public', 'images', 'bikes');

function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ── Step 1: Remove discontinued bikes ────────────────────────────────────────
const discontinued = [
  'cannondale-adventure-neo-3',
  'giant-explore-e-1',
  'giant-fastroad-e-1-pro',
  'rad-power-bikes-radcity-5-plus',
  'rad-power-bikes-radrover-6-plus',
];

// ── Step 2: Replacement bike data ─────────────────────────────────────────────
const BRANDS = Object.fromEntries(
  (await sql`SELECT id, slug FROM brands`).map(b => [b.slug, b.id])
);

const replacements = [
  // 1. Cannondale Adventure Neo Allroad EQ (2025)
  //    Replaces: Cannondale Adventure Neo 3
  //    Source: cannondale.com + multiple reviewer specs
  {
    brand: 'cannondale',
    model_name: 'Adventure Neo Allroad EQ',
    year: 2025,
    msrp: 1825,
    category: 'commuter',
    ebike_class: 2,
    motor_watts: 250,
    motor_type: 'rear hub',
    motor_torque_nm: 45,
    battery_wh: 418,
    range_miles_low: 25,
    range_miles_high: 47,
    top_speed_mph: 20,
    charge_time_hours: 5.0,
    weight_lbs: 50,
    max_payload_lbs: 275,
    wheel_size: '27.5"',
    frame_material: 'aluminum',
    gearing: '7-speed microSHIFT',
    brakes: 'hydraulic disc',
    suspension: 'none',
    has_throttle: true,
    has_torque_sensor: true,
    has_app: false,
    has_removable_battery: true,
    key_features: [
      'Torque-sensing Bafang G020 rear hub motor for smooth, proportional assist',
      'Class 2 with thumb throttle — a first for Cannondale eBikes',
      'Includes integrated lights, rear rack, fenders, and kickstand',
      'Semi-integrated removable 418Wh battery with key lock',
    ],
    pros: [
      'Excellent value at $1,825 with full accessory package included',
      'Versatile all-road geometry handles gravel, rail trails, and city streets',
      'Torque sensor delivers natural, smooth power delivery',
      'Backed by nationwide Cannondale dealer network',
    ],
    cons: [
      '250W/418Wh system shows strain on sustained steep climbs',
      'No suspension fork — rigid ride on rough pavement',
      'Basic LCD display lacks sunlight readability',
    ],
    best_for: 'Urban commuters and weekend adventurers who want a fully-equipped all-rounder from a trusted brand with bike shop support',
    expert_rating: 7.8,
    affiliate_url: 'https://www.cannondale.com/en-us/bikes/electric/e-urban/adventure-neo-allroad/adventure-neo-allroad-eq-c68564m',
    image_url: 'https://embed.widencdn.net/img/dorelrl/qst4yemvlb/2000px@1x/C24_C68403M_Adventure_Neo_Allrd_EQ_GRA_PD.png',
    image_ext: 'png',
  },

  // 2. Giant Explore E+ 2 STA (2026)
  //    Replaces: Giant Explore E+ 1
  //    Source: Giant dealer sites, cycling media (cyclingelectric.com, bike-ev.com)
  {
    brand: 'giant',
    model_name: 'Explore E+ 2 STA',
    year: 2026,
    msrp: 3699,
    category: 'hybrid',
    ebike_class: 3,
    motor_watts: 250,
    motor_type: 'mid-drive',
    motor_torque_nm: 75,
    battery_wh: 625,
    range_miles_low: 40,
    range_miles_high: 75,
    top_speed_mph: 28,
    charge_time_hours: 4.5,
    weight_lbs: 59,
    max_payload_lbs: 265,
    wheel_size: '700c',
    frame_material: 'aluminum',
    gearing: '9-speed Shimano Alivio',
    brakes: 'hydraulic disc',
    suspension: 'front fork',
    has_throttle: false,
    has_torque_sensor: true,
    has_app: true,
    has_removable_battery: true,
    key_features: [
      'New SyncDrive Sport2 mid-drive motor (75Nm) — significantly more power than prior gen',
      'Aegis Safety suite: tire pressure monitoring + E-Lock with Apple Find My GPS',
      'New RideDash EVO 2.0 color display (3") integrated into stem',
      'Full accessory kit: fenders, integrated lights, MIK-compatible rear rack, kickstand',
      '700c x 57mm tires handle gravel and rough pavement with confidence',
    ],
    pros: [
      '75Nm mid-drive handles hills effortlessly with natural pedal feel',
      'Aegis safety tech (TPMS + GPS lock) is unique in the class',
      'Full accessory package included — nothing extra to buy',
      'Giant dealer network provides local service and support',
    ],
    cons: [
      'Heavy at 59 lbs — challenging to carry or store in tight spaces',
      'Pedal-assist only, no throttle',
      'Higher price vs. competitors like Trek Allant+ and Specialized Vado',
    ],
    best_for: 'Commuters and fitness riders who want a premium, fully-loaded hybrid with cutting-edge safety technology',
    expert_rating: 8.5,
    affiliate_url: 'https://www.giant-bicycles.com/us/explore-e',
    image_url: 'https://www.sefiles.net/images/library/large/giant-explore-e-2-sta-28mph-381495-1.jpg',
    image_ext: 'jpg',
  },

  // 3. Giant FastRoad E+ EX Pro (2025)
  //    Replaces: Giant FastRoad E+ 1 Pro
  //    Source: giant-bicycles.com, multiple dealer sites
  {
    brand: 'giant',
    model_name: 'FastRoad E+ EX Pro',
    year: 2025,
    msrp: 4300,
    category: 'commuter',
    ebike_class: 3,
    motor_watts: 250,
    motor_type: 'mid-drive',
    motor_torque_nm: 80,
    battery_wh: 500,
    range_miles_low: 31,
    range_miles_high: 99,
    top_speed_mph: 28,
    charge_time_hours: 2.5,
    weight_lbs: 44,
    max_payload_lbs: 265,
    wheel_size: '27.5"',
    frame_material: 'aluminum',
    gearing: '10-speed Shimano Tiagra',
    brakes: 'hydraulic disc',
    suspension: 'none',
    has_throttle: false,
    has_torque_sensor: true,
    has_app: true,
    has_removable_battery: true,
    key_features: [
      'Lightest in class at 44 lbs — dramatically lighter than comparable e-bikes',
      'SyncDrive Pro mid-drive (80Nm) delivers road-bike-like performance to 28 mph',
      '10-speed Shimano Tiagra flat-bar drivetrain with GRX clutch derailleur',
      'D-Fuse seatpost absorbs road vibration for all-day comfort',
      'Compatible with 250Wh range extender for 750Wh total capacity',
    ],
    pros: [
      'Exceptionally light for a fully-equipped commuter e-bike (44 lbs with battery)',
      'Powerful 80Nm motor with quiet, natural power delivery up to 28 mph',
      'Full commuter kit included: rack, fenders, lights, kickstand',
      'Tubeless-ready rims for reliable flat performance on daily rides',
    ],
    cons: [
      'No suspension — uncomfortable on rough urban surfaces',
      '$4,300 price point puts it at premium territory',
      'Limited dealer availability in 2025 as model approaches end-of-cycle',
    ],
    best_for: 'Fast urban commuters who prioritize low weight and road-bike performance over suspension or cargo capacity',
    expert_rating: 8.3,
    affiliate_url: 'https://www.giant-bicycles.com/us/showcase/fastroad-e-ex-pro',
    image_url: 'https://www.sefiles.net/images/library/large/giant-fastroad-e-ex-pro-28mph-341081-1-11-1.jpg',
    image_ext: 'jpg',
  },

  // 4. Rad Power Bikes Radster Road (2025)
  //    Replaces: Rad Power Bikes RadCity 5 Plus
  //    Source: radpowerbikes.com + electricbikereport.com review
  {
    brand: 'rad-power-bikes',
    model_name: 'Radster Road',
    year: 2025,
    msrp: 1999,
    category: 'commuter',
    ebike_class: 2,
    motor_watts: 750,
    motor_type: 'rear hub',
    motor_torque_nm: 100,
    battery_wh: 720,
    range_miles_low: 25,
    range_miles_high: 65,
    top_speed_mph: 28,
    charge_time_hours: 7.5,
    weight_lbs: 75,
    max_payload_lbs: 320,
    wheel_size: '29"',
    frame_material: 'aluminum',
    gearing: '8-speed Shimano Altus',
    brakes: 'hydraulic disc',
    suspension: 'front fork',
    has_throttle: true,
    has_torque_sensor: true,
    has_app: false,
    has_removable_battery: true,
    ul_certified: true,
    key_features: [
      'Torque sensor for natural, cadence-matched power delivery — a major upgrade for Rad',
      'Safe Shield battery: dual UL certified (UL 2271 & UL 2849) with fire-resistant cell barriers',
      'Integrated turn signals, brake lights, and 450-lumen headlight for urban visibility',
      'Proximity keycard + 4-digit PIN security lock with motor immobilizer',
      'Class-switchable (1/2/3) to comply with local regulations',
    ],
    pros: [
      'Best-in-class safety credentials: dual UL certified with Safe Shield battery tech',
      'Torque sensor delivers dramatically smoother assist than older Rad models',
      'Strong real-world range — 53+ miles tested at moderate assist',
      '320 lb payload capacity accommodates heavier riders',
    ],
    cons: [
      'Heavy at 75 lbs — difficult to carry up stairs or load onto bike racks',
      '7.5-hour charge time is slow; no fast-charging option',
      'No smartphone app connectivity',
    ],
    best_for: 'Daily urban commuters who want Rad\'s proven value with better safety tech, a torque sensor, and Class 3 speed flexibility under $2,000',
    expert_rating: 8.0,
    affiliate_url: 'https://www.radpowerbikes.com/products/radster-road-electric-commuter-bike',
    image_url: 'https://cdn.shopify.com/s/files/1/0799/9645/files/Radster_Road_Regular_Bay_Blue_Right_Side.png?v=1710546666',
    image_ext: 'png',
  },

  // 5. Rad Power Bikes Radster Trail (2025)
  //    Replaces: Rad Power Bikes RadRover 6 Plus
  //    Source: radpowerbikes.com + electricbikereport.com review
  {
    brand: 'rad-power-bikes',
    model_name: 'Radster Trail',
    year: 2025,
    msrp: 1999,
    category: 'fat-tire',
    ebike_class: 2,
    motor_watts: 750,
    motor_type: 'rear hub',
    motor_torque_nm: 100,
    battery_wh: 720,
    range_miles_low: 25,
    range_miles_high: 65,
    top_speed_mph: 28,
    charge_time_hours: 7.5,
    weight_lbs: 77.5,
    max_payload_lbs: 370,
    wheel_size: '27.5" x 3.0"',
    frame_material: 'aluminum',
    gearing: '8-speed Shimano Acera',
    brakes: 'hydraulic disc',
    suspension: 'front fork',
    has_throttle: true,
    has_torque_sensor: true,
    has_app: false,
    has_removable_battery: true,
    ul_certified: true,
    key_features: [
      '27.5" x 3.0" mid-fat tires: more agile than 4" fat tires, handles gravel and light trail',
      '100Nm torque sensor hub motor for smooth, responsive off-road assist',
      'Safe Shield UL-certified battery with individual cell fire barriers',
      'Integrated lights, turn signals, rear rack (55 lb capacity), fenders, kickstand',
      'Proximity keycard + 4-digit PIN security with motor immobilizer',
    ],
    pros: [
      '370 lb max payload — highest in Rad\'s lineup, ideal for heavier riders',
      'Mid-fat tires offer better road feel than 4" tires while keeping off-road capability',
      'Excellent tested range (75+ miles at low assist) with 720Wh battery',
      'Torque sensor provides smoother trail performance vs. cadence sensors',
    ],
    cons: [
      'At 77.5 lbs, heavy compared to most trail e-bike competitors',
      '7.5-hour charge time; no fast charging option',
      'No smartphone app; basic color LCD display',
    ],
    best_for: 'Riders who want a versatile do-everything e-bike for mixed terrain — light trails, gravel, and daily commuting — with high payload capacity at an accessible price',
    expert_rating: 8.1,
    affiliate_url: 'https://www.radpowerbikes.com/products/radster-trail-electric-off-road-bike',
    image_url: 'https://cdn.shopify.com/s/files/1/0799/9645/files/Radster_Trail_Regular_Copper_Red_Right_Side.png?v=1709660016',
    image_ext: 'png',
  },
];

// ── Execute ───────────────────────────────────────────────────────────────────
console.log('\n🔄  Replacing discontinued bikes\n' + '─'.repeat(50));

// 1. Soft-delete discontinued bikes
console.log('Removing discontinued bikes...');
for (const slug of discontinued) {
  const result = await sql`UPDATE bikes SET is_active = false, updated_at = NOW() WHERE slug = ${slug}`;
  console.log(`  ✓ Deactivated: ${slug} (${result.count} row)`);
}

// 2. Download images and insert replacement bikes
console.log('\nAdding replacement bikes...');
for (const bike of replacements) {
  const brandId = BRANDS[bike.brand];
  if (!brandId) { console.log(`  ✗ Brand not found: ${bike.brand}`); continue; }

  const slug = `${bike.brand}-${toSlug(bike.model_name)}`;

  // Check if already exists (re-run safety)
  const existing = await sql`SELECT id FROM bikes WHERE slug = ${slug}`;
  if (existing.length > 0) {
    console.log(`  ⚠ Already exists: ${slug}`);
    continue;
  }

  // Download product image
  let heroImageUrl = null;
  try {
    const resp = await fetch(bike.image_url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (resp.ok) {
      const ct = resp.headers.get('content-type') || '';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : bike.image_ext || 'jpg';
      const buf = Buffer.from(await resp.arrayBuffer());
      const filename = `${slug}.${ext}`;
      writeFileSync(`${OUT}/${filename}`, buf);
      heroImageUrl = `/images/bikes/${filename}`;
      console.log(`  📸 ${filename} (${(buf.length / 1024).toFixed(0)}KB)`);
    } else {
      console.log(`  ⚠ Image HTTP ${resp.status}: ${bike.image_url.substring(0, 60)}`);
    }
  } catch (e) {
    console.log(`  ⚠ Image download failed: ${e.message.substring(0, 50)}`);
  }

  // Insert bike
  await sql`
    INSERT INTO bikes (
      brand_id, model_name, slug, year, msrp, category, ebike_class,
      motor_watts, motor_type, motor_torque_nm, battery_wh,
      range_miles_low, range_miles_high, top_speed_mph, charge_time_hours,
      weight_lbs, max_payload_lbs, wheel_size, frame_material,
      gearing, brakes, suspension,
      has_throttle, has_torque_sensor, has_app, has_removable_battery,
      ${bike.ul_certified ? sql`ul_certified,` : sql``}
      key_features, pros, cons, best_for, expert_rating,
      affiliate_url, hero_image_url,
      is_active, created_at, updated_at
    ) VALUES (
      ${brandId}, ${bike.model_name}, ${slug}, ${bike.year}, ${bike.msrp},
      ${bike.category}, ${bike.ebike_class},
      ${bike.motor_watts}, ${bike.motor_type}, ${bike.motor_torque_nm}, ${bike.battery_wh},
      ${bike.range_miles_low}, ${bike.range_miles_high}, ${bike.top_speed_mph}, ${bike.charge_time_hours},
      ${bike.weight_lbs}, ${bike.max_payload_lbs}, ${bike.wheel_size}, ${bike.frame_material},
      ${bike.gearing}, ${bike.brakes}, ${bike.suspension},
      ${bike.has_throttle}, ${bike.has_torque_sensor}, ${bike.has_app}, ${bike.has_removable_battery},
      ${bike.ul_certified ? sql`${true},` : sql``}
      ${bike.key_features}, ${bike.pros}, ${bike.cons}, ${bike.best_for}, ${bike.expert_rating},
      ${bike.affiliate_url}, ${heroImageUrl},
      true, NOW(), NOW()
    )
  `;

  console.log(`  ✓ Inserted: ${bike.model_name} (${slug})`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
const activeCount = await sql`SELECT COUNT(*) as n FROM bikes WHERE is_active = true`;
console.log('\n' + '─'.repeat(50));
console.log(`✅ Done — ${activeCount[0].n} active bikes in catalog`);

await sql.end();
