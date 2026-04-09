/**
 * Seeds the `states` table with all 50 US states + DC.
 * Includes eBike law summaries, class rules, helmet requirements.
 * Run: node scripts/seed-states.mjs
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

const states = [
  { code: 'AL', name: 'Alabama', slug: 'alabama', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'Alabama follows a 3-class eBike system. Class 1 and 2 eBikes are allowed on bike paths. Class 3 are limited to roadways. Riders under 16 must wear a helmet.' },
  { code: 'AK', name: 'Alaska', slug: 'alaska', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Alaska has adopted the 3-class eBike system. eBikes are treated similarly to bicycles and generally permitted where bicycles are allowed.' },
  { code: 'AZ', name: 'Arizona', slug: 'arizona', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Arizona follows the 3-class eBike system. eBikes up to 750W are exempt from motor vehicle registration. No helmet requirement for adults.' },
  { code: 'AR', name: 'Arkansas', slug: 'arkansas', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Arkansas has adopted a 3-class eBike framework. eBikes are permitted on bike paths and multi-use trails unless otherwise posted.' },
  { code: 'CA', name: 'California', slug: 'california', ebike_classes_allowed: 'Class 1, 2 on paths; Class 3 roads only', helmet_required: true, min_age: 16, registration_required: false, ebike_law_summary: 'California has strict eBike regulations. Class 3 riders must be 16+ and wear a helmet. Class 3 eBikes are prohibited from bike paths unless local authorities allow. Class 1 and 2 are permitted on most paths.', rebate_programs: [{ name: 'Clean Vehicle Rebate Project (CVAP)', amount: 'Up to $2,000', url: 'https://cleanvehiclerebate.org', eligibility: 'Income-qualified CA residents' }, { name: 'Bay Area e-Bike Incentive Program', amount: 'Up to $2,000', url: 'https://www.bayareametro.gov', eligibility: 'Bay Area residents, income-qualified' }] },
  { code: 'CO', name: 'Colorado', slug: 'colorado', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Colorado has a comprehensive eBike law allowing eBikes where traditional bikes are permitted. Class 1 and 2 are allowed on most trails; Class 3 is road-only. Helmet required under 18.', rebate_programs: [{ name: 'Colorado eBike Tax Credit', amount: 'Up to $1,500 (or 30% of cost)', url: 'https://cdor.colorado.gov', eligibility: 'CO residents; income limits apply for enhanced credit' }] },
  { code: 'CT', name: 'Connecticut', slug: 'connecticut', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'Connecticut requires helmets for all eBike riders. eBikes follow the 3-class system and are treated as bicycles for most purposes.' },
  { code: 'DE', name: 'Delaware', slug: 'delaware', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'Delaware requires helmets for all eBike riders. Class 1 and 2 are allowed on bike paths; Class 3 is limited to roads.' },
  { code: 'FL', name: 'Florida', slug: 'florida', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Florida adopted the 3-class eBike system in 2020. eBikes are generally permitted where bicycles are allowed. Helmet required under 16.' },
  { code: 'GA', name: 'Georgia', slug: 'georgia', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Georgia follows the 3-class eBike system. eBikes are treated as bicycles and permitted in bicycle lanes and paths unless restricted.' },
  { code: 'HI', name: 'Hawaii', slug: 'hawaii', ebike_classes_allowed: 'Class 1, 2', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'Hawaii restricts eBikes to Class 1 and 2 (max 20 mph). Class 3 eBikes are not permitted. Helmets required for all riders.' },
  { code: 'ID', name: 'Idaho', slug: 'idaho', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Idaho follows the 3-class eBike system. Class 1 eBikes are allowed on multi-use paths. Class 3 is limited to roadways.' },
  { code: 'IL', name: 'Illinois', slug: 'illinois', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Illinois adopted a 3-class eBike framework. eBikes are allowed where bikes are permitted. Helmet required under 16.' },
  { code: 'IN', name: 'Indiana', slug: 'indiana', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Indiana follows the 3-class eBike system. eBikes under 750W and 20 mph (28 mph for Class 3) are treated as bicycles.' },
  { code: 'IA', name: 'Iowa', slug: 'iowa', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Iowa follows the 3-class eBike system and treats eBikes as bicycles for most purposes.' },
  { code: 'KS', name: 'Kansas', slug: 'kansas', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Kansas has adopted the 3-class eBike system. eBikes are permitted where bicycles are allowed unless otherwise posted.' },
  { code: 'KY', name: 'Kentucky', slug: 'kentucky', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Kentucky follows a 3-class eBike system and generally treats eBikes the same as traditional bicycles.' },
  { code: 'LA', name: 'Louisiana', slug: 'louisiana', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'Louisiana requires helmets for all eBike riders. eBikes follow the 3-class system and are permitted where bicycles are allowed.' },
  { code: 'ME', name: 'Maine', slug: 'maine', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Maine has adopted eBike regulations treating them as bicycles. Helmet required under 16.' },
  { code: 'MD', name: 'Maryland', slug: 'maryland', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'Maryland requires helmets for all eBike riders under 16. eBikes follow the 3-class system. Class 3 is limited to roadways.' },
  { code: 'MA', name: 'Massachusetts', slug: 'massachusetts', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Massachusetts adopted eBike legislation in 2022. Class 1 and 2 are permitted on shared paths. Class 3 is limited to roads.' },
  { code: 'MI', name: 'Michigan', slug: 'michigan', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Michigan follows the 3-class eBike system. eBikes are treated as bicycles for path access unless local ordinance restricts them.' },
  { code: 'MN', name: 'Minnesota', slug: 'minnesota', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Minnesota has adopted eBike legislation. Class 1 and 2 are allowed on bike paths. Class 3 is restricted to roadways.' },
  { code: 'MS', name: 'Mississippi', slug: 'mississippi', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Mississippi follows the 3-class eBike framework and generally treats eBikes the same as traditional bicycles.' },
  { code: 'MO', name: 'Missouri', slug: 'missouri', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Missouri treats eBikes as bicycles. The 3-class system applies. Helmet required under 16.' },
  { code: 'MT', name: 'Montana', slug: 'montana', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Montana follows the 3-class eBike system. eBikes are generally permitted where bicycles are allowed.' },
  { code: 'NE', name: 'Nebraska', slug: 'nebraska', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Nebraska has adopted eBike laws treating them similarly to traditional bicycles under the 3-class system.' },
  { code: 'NV', name: 'Nevada', slug: 'nevada', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Nevada follows the 3-class eBike system. eBikes are allowed on bike paths and lanes. Helmet required under 18.' },
  { code: 'NH', name: 'New Hampshire', slug: 'new-hampshire', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'New Hampshire follows the 3-class eBike system. eBikes are generally treated as bicycles.' },
  { code: 'NJ', name: 'New Jersey', slug: 'new-jersey', ebike_classes_allowed: 'Class 1, 2 (Class 3 treated as motor vehicle)', helmet_required: true, min_age: 15, registration_required: false, ebike_law_summary: 'New Jersey has reclassified some eBikes. Class 3 eBikes may be treated as motorized vehicles. Helmet required for riders under 17. Class 1 and 2 are generally allowed on bike paths.' },
  { code: 'NM', name: 'New Mexico', slug: 'new-mexico', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'New Mexico follows the 3-class eBike system and generally treats eBikes the same as bicycles.' },
  { code: 'NY', name: 'New York', slug: 'new-york', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'New York legalized Class 1, 2, and 3 eBikes statewide in 2020. Helmet required for riders under 18. NYC has additional local rules.', rebate_programs: [{ name: 'NYC E-Bike Rebate', amount: 'Up to $200', url: 'https://www.nyc.gov', eligibility: 'NYC residents' }] },
  { code: 'NC', name: 'North Carolina', slug: 'north-carolina', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'North Carolina follows the 3-class eBike system. eBikes are treated as bicycles and permitted where bikes are allowed.' },
  { code: 'ND', name: 'North Dakota', slug: 'north-dakota', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'North Dakota follows the 3-class eBike system and generally treats eBikes as bicycles.' },
  { code: 'OH', name: 'Ohio', slug: 'ohio', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Ohio follows the 3-class eBike system. eBikes are allowed on shared paths unless restricted by local authority.' },
  { code: 'OK', name: 'Oklahoma', slug: 'oklahoma', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Oklahoma has adopted eBike legislation treating eBikes as bicycles under the 3-class system.' },
  { code: 'OR', name: 'Oregon', slug: 'oregon', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'Oregon requires helmets for all eBike riders. Class 1 and 2 are allowed on bike paths. Class 3 is limited to roadways.' },
  { code: 'PA', name: 'Pennsylvania', slug: 'pennsylvania', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Pennsylvania follows the 3-class eBike system. Helmet required under 12. eBikes are treated as bicycles.' },
  { code: 'RI', name: 'Rhode Island', slug: 'rhode-island', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Rhode Island has adopted eBike regulations under the 3-class system, treating eBikes similarly to bicycles.' },
  { code: 'SC', name: 'South Carolina', slug: 'south-carolina', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'South Carolina follows the 3-class eBike system and treats eBikes as bicycles for most purposes.' },
  { code: 'SD', name: 'South Dakota', slug: 'south-dakota', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'South Dakota follows the 3-class eBike system. eBikes are treated as bicycles and permitted where bikes are allowed.' },
  { code: 'TN', name: 'Tennessee', slug: 'tennessee', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Tennessee follows the 3-class eBike system. eBikes are generally treated as bicycles.' },
  { code: 'TX', name: 'Texas', slug: 'texas', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Texas has adopted a 3-class eBike system. eBikes are treated as bicycles on most paths and roads. Helmet required under 18.' },
  { code: 'UT', name: 'Utah', slug: 'utah', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Utah follows the 3-class eBike system. Class 1 and 2 are permitted on shared-use paths. Class 3 is limited to roadways.' },
  { code: 'VT', name: 'Vermont', slug: 'vermont', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Vermont follows the 3-class eBike system. Helmet required under 16. eBikes are treated as bicycles.' },
  { code: 'VA', name: 'Virginia', slug: 'virginia', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Virginia has adopted eBike legislation under the 3-class system. eBikes are permitted where bicycles are allowed.' },
  { code: 'WA', name: 'Washington', slug: 'washington', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: true, min_age: null, registration_required: false, ebike_law_summary: 'Washington requires helmets for all eBike riders. Class 1 and 2 are allowed on shared-use paths. Class 3 is limited to roads.' },
  { code: 'WV', name: 'West Virginia', slug: 'west-virginia', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'West Virginia follows the 3-class eBike system and treats eBikes similarly to traditional bicycles.' },
  { code: 'WI', name: 'Wisconsin', slug: 'wisconsin', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Wisconsin follows the 3-class eBike system. eBikes are treated as bicycles and permitted where bikes are allowed.' },
  { code: 'WY', name: 'Wyoming', slug: 'wyoming', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'Wyoming follows the 3-class eBike system and generally treats eBikes as bicycles.' },
  { code: 'DC', name: 'District of Columbia', slug: 'district-of-columbia', ebike_classes_allowed: 'Class 1, 2, 3', helmet_required: false, min_age: null, registration_required: false, ebike_law_summary: 'DC allows all 3 classes of eBikes. Class 1 and 2 are permitted on bike lanes and paths. Class 3 must use roadways.' },
];

console.log(`Seeding ${states.length} states...`);
let count = 0;
for (const state of states) {
  try {
    await sql`
      INSERT INTO states (code, name, slug, ebike_law_summary, ebike_classes_allowed,
        helmet_required, min_age, registration_required, rebate_programs)
      VALUES (
        ${state.code}, ${state.name}, ${state.slug},
        ${state.ebike_law_summary || null},
        ${state.ebike_classes_allowed || null},
        ${state.helmet_required ?? false},
        ${state.min_age || null},
        ${state.registration_required ?? false},
        ${state.rebate_programs ? JSON.stringify(state.rebate_programs) : null}
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        ebike_law_summary = EXCLUDED.ebike_law_summary,
        ebike_classes_allowed = EXCLUDED.ebike_classes_allowed,
        helmet_required = EXCLUDED.helmet_required,
        min_age = EXCLUDED.min_age,
        registration_required = EXCLUDED.registration_required,
        rebate_programs = EXCLUDED.rebate_programs
    `;
    console.log(`✓ ${state.code} — ${state.name}`);
    count++;
  } catch (err) {
    console.error(`✗ ${state.code}: ${err.message}`);
  }
}

console.log(`\nSeeded ${count} states.`);
await sql.end();
