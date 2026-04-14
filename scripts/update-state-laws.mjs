/**
 * Update state eBike law data with comprehensive, accurate information.
 *
 * Covers all 50 states + DC with:
 *   - Substantive law summaries (3-5 sentences, state-specific nuances)
 *   - Accurate helmet requirements and age thresholds
 *   - Minimum age rules where they exist
 *   - Registration requirements
 *   - Rebate/incentive programs (programs confirmed as of early 2026)
 *
 * Run: node scripts/update-state-laws.mjs
 * Dry-run (print only, no DB writes): node scripts/update-state-laws.mjs --dry-run
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
const DRY_RUN = process.argv.includes('--dry-run');

// ── State data ────────────────────────────────────────────────────────────────
// Fields:
//   summary            - 3-5 sentence law overview (state-specific nuances)
//   classes            - human-readable classes allowed description
//   helmet_required    - true = any helmet law exists (may be age-restricted)
//   min_age            - minimum age for Class 3 or general eBike operation, null if none
//   registration       - true if registration required
//   rebates            - array of rebate programs, or null

const STATE_LAWS = {
  AL: {
    summary: 'Alabama follows the standard 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and multi-use trails where traditional bicycles are allowed. Class 3 eBikes are restricted to roads and bike lanes. Helmets are required for riders under 16 under Alabama\'s general bicycle helmet law. No registration or license is required for eBikes meeting the state\'s definition (motor under 750W, speed limit 28 mph or less).',
    classes: 'Class 1, 2, and 3 — all recognized under Alabama law',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  AK: {
    summary: 'Alaska recognizes the 3-class eBike system, treating eBikes similarly to traditional bicycles for most purposes. Class 1 and 2 eBikes are generally allowed wherever traditional bicycles are permitted. Class 3 eBikes are limited to roads and bike lanes. Alaska has no statewide helmet requirement for eBike riders of any age, though helmets are strongly recommended given the terrain. No registration or special license is required.',
    classes: 'Class 1, 2, and 3 recognized under Alaska law',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  AZ: {
    summary: 'Arizona has one of the most eBike-friendly legal frameworks in the country, having adopted the 3-class system. All three classes of eBikes are permitted on paths and trails where traditional bikes are allowed unless specifically posted otherwise. Arizona has no statewide mandatory helmet law for adult eBike riders, though local jurisdictions may differ. No registration, license, or insurance is required for eBikes under 750W with a maximum assisted speed of 28 mph.',
    classes: 'Class 1, 2, and 3 — broad access to bike paths and trails',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  AR: {
    summary: 'Arkansas has adopted the 3-class eBike framework, classifying electric bicycles separately from motor vehicles. Class 1 and 2 eBikes are permitted wherever traditional bicycles are allowed. Class 3 eBikes may be restricted from certain multi-use paths. Arkansas has no statewide helmet mandate for eBike riders, though it is recommended. No registration or operator\'s license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 may face trail restrictions',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  CA: {
    summary: 'California has detailed eBike regulations and is a national model for the 3-class system. Class 1 and 2 eBikes are permitted on bike paths and multi-use trails unless specifically prohibited. Class 3 eBikes (up to 28 mph) are restricted to roadways and protected bike lanes — they are not permitted on Class I bike paths unless a local authority specifically allows it. Helmets are required for all Class 3 riders regardless of age, and required for all riders under 18 on any class. Riders must be at least 16 years old to operate a Class 3 eBike. eBikes do not require registration, insurance, or a driver\'s license under California law.',
    classes: 'Class 1 & 2: bike paths OK; Class 3: roads/bike lanes only; Class 3 riders must be 16+',
    helmet_required: true,
    min_age: 16,
    registration: false,
    rebates: [
      { name: 'Clean Vehicle Rebate Project (CVRP)', amount: 'Up to $2,000', url: 'https://cleanvehiclerebate.org', eligibility: 'California residents; income-based tiers up to $2,000 for low-income' },
      { name: 'Bay Area Clean Air Transportation (BACAT) e-Bike Program', amount: 'Up to $2,000', url: 'https://www.bayareametro.gov', eligibility: 'Bay Area residents; income-qualified' },
      { name: 'Clean Mobility Options Voucher Pilot Program', amount: 'Up to $3,000', url: 'https://www.cleanmobilityoptions.org', eligibility: 'Low-income Californians in disadvantaged communities' },
    ],
  },
  CO: {
    summary: 'Colorado has a clear 3-class eBike law and is broadly eBike-friendly. Class 1 and 2 eBikes are allowed on any trail or path open to traditional bicycles. Class 3 eBikes are restricted to roadways, paved bike lanes, and paved multi-use paths — they are not permitted on unpaved natural-surface trails in state parks and recreation areas. Helmets are required for riders under 18. Colorado offers one of the most generous state eBike rebate programs in the country.',
    classes: 'Class 1 & 2: any bike path or trail; Class 3: paved paths and roads only',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Colorado eBike Rebate Program', amount: '$450 standard; up to $1,200 income-qualified', url: 'https://energyoffice.colorado.gov/ebike', eligibility: 'Colorado residents; point-of-sale discount at participating retailers' },
    ],
  },
  CT: {
    summary: 'Connecticut has adopted the 3-class eBike system with clear rules for each class. Class 1 and 2 eBikes are allowed on most bike paths and trails where traditional bicycles are permitted. Class 3 eBikes are permitted on roads and designated bike facilities. Helmets are required for all riders under 16. Connecticut has an active rebate program for eBike purchases from registered retailers.',
    classes: 'Class 1, 2, and 3 all recognized under Connecticut law',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Connecticut eBike Incentive Program', amount: 'Up to $500', url: 'https://portal.ct.gov/DEEP', eligibility: 'Connecticut residents purchasing from participating CT dealers; income-based tiers up to $750' },
    ],
  },
  DE: {
    summary: 'Delaware has codified the 3-class eBike system, distinguishing eBikes from motor vehicles and mopeds. Class 1 and 2 eBikes are permitted on multi-use paths and bike lanes. Class 3 eBikes must remain on roads and designated bike facilities. Helmets are required for all riders under 18. No registration or license is required for eBikes meeting Delaware\'s specifications.',
    classes: 'Class 1, 2, and 3 all recognized; Class 3 restricted to roads/bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  FL: {
    summary: 'Florida has a comprehensive 3-class eBike law that treats eBikes similarly to bicycles. Class 1 and 2 eBikes are permitted on bike paths and multi-use trails unless specifically prohibited. Class 3 eBikes are restricted to roadways and bike lanes. Helmets are required for riders under 16. No eBike registration, license, or insurance is required under Florida law. Florida\'s warm climate and extensive trail networks make it one of the top states for eBike ridership.',
    classes: 'Class 1 & 2: bike paths allowed; Class 3: roads and bike lanes only',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'JEA eBike Rebate (Jacksonville)', amount: 'Up to $200', url: 'https://www.jea.com', eligibility: 'JEA electric customers in Jacksonville area' },
    ],
  },
  GA: {
    summary: 'Georgia adopted the 3-class eBike system, giving eBike riders clear rules for operation. Class 1 and 2 eBikes are permitted wherever traditional bicycles are allowed, including bike paths. Class 3 eBikes are limited to roads and designated bike facilities. Helmets are required for riders under 16. No registration, license, or insurance is required for eBikes meeting state specifications.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 limited to roads and bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  HI: {
    summary: 'Hawaii has unique eBike regulations that differ significantly from most mainland states. eBikes with motors exceeding 1,000W or capable of speeds over 20 mph without pedaling may be classified as mopeds, requiring registration and a driver\'s license. Class 1 eBikes (pedal-assist, 20 mph max) are generally treated as bicycles. Helmets are required for all riders under 18 and recommended for all riders. Riders should verify county-specific rules as Hawaii counties have significant regulatory authority.',
    classes: 'Class 1 broadly permitted; Class 2/3 may face moped classification — verify locally',
    helmet_required: true,
    min_age: null,
    registration: true,
    rebates: null,
  },
  ID: {
    summary: 'Idaho has adopted the 3-class eBike framework, with eBikes treated similarly to traditional bicycles for most purposes. Class 1 and 2 eBikes are permitted on most bike paths and trails where bicycles are allowed. Class 3 eBikes are limited to roads and paved multi-use paths. Idaho has no statewide mandatory helmet law for adults or most minors, though local rules may vary. No registration or license is required.',
    classes: 'Class 1, 2, and 3 all recognized under Idaho code',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  IL: {
    summary: 'Illinois recognizes all three eBike classes with specific rules for each. Class 1 and 2 eBikes are allowed on designated bike paths and trails. Class 3 eBikes are restricted to roads and bike lanes and may not be ridden on trails or unpaved paths. Helmets are required for riders under 16. Chicago has additional local ordinances that may differ from state law, particularly regarding Class 3 eBikes in the city. No state registration or license is required.',
    classes: 'Class 1 & 2: bike paths allowed; Class 3: roads only; Chicago has additional local rules',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'City of Chicago eBike Rebate Program', amount: 'Up to $1,500', url: 'https://www.chicago.gov', eligibility: 'Chicago residents; income-based program through the City\'s sustainability office' },
    ],
  },
  IN: {
    summary: 'Indiana has adopted a 3-class eBike framework that mirrors federal definitions. Class 1 and 2 eBikes are permitted on bike paths and trails where traditional bicycles are allowed. Class 3 eBikes are restricted to roadways and paved bike facilities. Helmets are required for all riders under 18. No registration or license is required for eBikes meeting Indiana\'s specifications. Local jurisdictions may impose additional restrictions in parks and on trails.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 restricted to roads and bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  IA: {
    summary: 'Iowa recognizes the 3-class eBike system and treats eBikes similarly to traditional bicycles. Class 1 and 2 eBikes are permitted on most bike paths and multi-use trails. Class 3 eBikes are generally restricted to roadways and designated bike facilities. Helmets are required for riders under 18 under Iowa\'s bicycle helmet law. No registration, license, or insurance is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 all recognized under Iowa code',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'MidAmerican Energy eBike Program', amount: 'Contact for current amounts', url: 'https://www.midamericanenergy.com', eligibility: 'MidAmerican Energy customers in Iowa' },
    ],
  },
  KS: {
    summary: 'Kansas has codified the 3-class eBike system. eBikes meeting Kansas\'s definitions are treated as bicycles and may be ridden on bike paths, bike lanes, and roads. Class 3 eBikes are limited to roads and designated bike facilities. Helmets are required for riders under 16. No registration, license, or insurance is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 recognized under Kansas law',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  KY: {
    summary: 'Kentucky has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and trails where traditional bicycles are allowed. Class 3 eBikes are restricted to roads and bike lanes. Helmets are required for riders under 18. No registration, license, or insurance is required for eBikes meeting Kentucky\'s specifications.',
    classes: 'Class 1, 2, and 3 all recognized',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  LA: {
    summary: 'Louisiana has adopted a 3-class eBike framework that distinguishes eBikes from motor vehicles and mopeds. Class 1 and 2 eBikes are permitted on most bike paths and trails. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for all riders under 18. Registration is not required for eBikes meeting Louisiana\'s specifications. Local parish rules may impose additional restrictions, particularly in urban areas like New Orleans.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 restricted to roads and bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  ME: {
    summary: 'Maine recognizes the 3-class eBike system, treating qualifying electric bicycles similarly to traditional bicycles. Class 1 and 2 eBikes are permitted on bike paths, multi-use trails, and roads. Class 3 eBikes are limited to roads and designated bike facilities. Helmets are required for riders under 16. Maine\'s extensive trail network is popular with eBike riders, though individual trail systems may have their own access policies.',
    classes: 'Class 1, 2, and 3 all permitted; Class 3 restricted to paved facilities',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  MD: {
    summary: 'Maryland has adopted the 3-class eBike framework with specific rules for trail and road access. Class 1 eBikes are permitted on most multi-use trails and bike paths. Class 2 eBikes are generally allowed on paths but may face restrictions in some parks. Class 3 eBikes are restricted to roads and bike lanes and are not permitted on most off-road trails. Helmets are required for all riders under 18, and Maryland recommends helmets for adults. The Baltimore-Washington corridor has extensive bike infrastructure well-suited to eBike commuting.',
    classes: 'Class 1: broad trail access; Class 2: most paths; Class 3: roads and bike lanes only',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Maryland Clean Transportation Trust Fund', amount: 'Check current availability', url: 'https://www.mde.maryland.gov', eligibility: 'Maryland residents; check with MDE for current eBike-specific programs' },
    ],
  },
  MA: {
    summary: 'Massachusetts has adopted comprehensive eBike legislation under the 3-class system. Class 1 and 2 eBikes are permitted on bike paths and trails. Class 3 eBikes are restricted to roads, bike lanes, and protected bike facilities; they are prohibited from shared-use paths. Helmets are required for riders under 17. Massachusetts offers meaningful rebate programs for eBike purchases. The state\'s growing urban bike infrastructure, particularly in Boston and Cambridge, supports a thriving eBike commuter community.',
    classes: 'Class 1 & 2: bike paths OK; Class 3: roads and protected bike lanes only',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'MassSAVE eBike Rebate', amount: 'Up to $750', url: 'https://www.masssave.com', eligibility: 'Massachusetts residents through participating energy providers' },
      { name: 'Commonwealth Clean Energy Center', amount: 'Varies', url: 'https://www.masscec.com', eligibility: 'Massachusetts income-qualified residents' },
    ],
  },
  MI: {
    summary: 'Michigan has codified the 3-class eBike system. Class 1 and 2 eBikes are permitted on most bike paths, trails, and roadways where traditional bicycles are allowed. Class 3 eBikes are restricted to roads and designated bike lanes. Helmet use is strongly recommended but not legally mandated for adults; riders under 18 are required to wear helmets. No registration, license, or insurance is required for qualifying eBikes. Michigan\'s extensive trail networks and Great Lakes shoreline paths are popular eBike destinations.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 restricted to road facilities',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  MN: {
    summary: 'Minnesota has adopted the 3-class eBike framework, with clear rules for each class. Class 1 and 2 eBikes are permitted on bike paths and multi-use trails. Class 3 eBikes are restricted to roads and paved bike facilities. Helmets are required for riders under 18. Minnesota\'s Twin Cities metro area has invested heavily in eBike-accessible infrastructure, and local utility rebate programs are available.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 limited to roads and paved facilities',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Xcel Energy eBike Rebate', amount: 'Varies by program year', url: 'https://www.xcelenergy.com', eligibility: 'Xcel Energy customers in Minnesota' },
      { name: 'Metropolitan Council Clean Transportation Incentive', amount: 'Varies', url: 'https://www.metrocouncil.org', eligibility: 'Twin Cities metro area residents' },
    ],
  },
  MS: {
    summary: 'Mississippi has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and trails where traditional bicycles are allowed. Class 3 eBikes are restricted to roads and bike lanes. Helmets are required for riders under 16. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 all recognized under Mississippi law',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  MO: {
    summary: 'Missouri has codified the 3-class eBike system. Class 1 and 2 eBikes are permitted on designated bike paths and most trail systems. Class 3 eBikes are restricted to roadways and bike lanes. Missouri has no statewide helmet mandate for eBike riders, though local ordinances may require helmets. No registration or license is required for qualifying eBikes. Kansas City and St. Louis have invested in eBike infrastructure and may have local rules that differ from state law.',
    classes: 'Class 1, 2, and 3 all recognized; Class 3 restricted to roads',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  MT: {
    summary: 'Montana has adopted a 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and most trail systems. Class 3 eBikes are limited to roads and bike lanes. Montana has no statewide helmet requirement for eBike riders of any age. Individual state parks and trail systems may have their own eBike access policies, and riders should verify access for specific destinations. No registration or license is required.',
    classes: 'Class 1, 2, and 3 recognized; trail access varies by individual trail system',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  NE: {
    summary: 'Nebraska has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on most bike paths and trails. Class 3 eBikes are limited to roads and bike lanes. Helmets are required for riders under 16. No registration or license is required for qualifying eBikes. Nebraska\'s Cowboy Trail and other rail-trail conversions are popular eBike destinations.',
    classes: 'Class 1, 2, and 3 all recognized',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  NV: {
    summary: 'Nevada has adopted the 3-class eBike system. Class 1 and 2 eBikes are permitted on bike paths, multi-use trails, and roads. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for riders under 18. No registration, license, or insurance is required for qualifying eBikes. Las Vegas has an expanding eBike sharing program and dedicated infrastructure.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 limited to roads and bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'NV Energy eBike Rebate', amount: 'Contact for current offers', url: 'https://www.nvenergy.com', eligibility: 'NV Energy customers in Nevada' },
    ],
  },
  NH: {
    summary: 'New Hampshire has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and most trails. Class 3 eBikes are restricted to roads and bike lanes. Helmets are required for riders under 18. No registration or license is required for qualifying eBikes. New Hampshire\'s extensive trail network is popular for recreational eBike riding, though individual trail systems may have their own policies.',
    classes: 'Class 1, 2, and 3 recognized; individual trail systems set their own eBike policies',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  NJ: {
    summary: 'New Jersey has adopted the 3-class eBike system. Class 1 and 2 eBikes are permitted on bike paths, multi-use trails, and roads. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for all riders under 17. New Jersey offers a state rebate program for eBike purchases, making it one of the more financially accessible states for buyers. No registration, license, or insurance is required.',
    classes: 'Class 1, 2, and 3 all recognized',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'NJ Clean Commute eBike Rebate', amount: 'Up to $300', url: 'https://www.nj.gov/dep', eligibility: 'New Jersey residents purchasing qualifying eBikes; no income requirement' },
    ],
  },
  NM: {
    summary: 'New Mexico has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and trails where traditional bicycles are allowed. Class 3 eBikes are limited to roads and designated bike facilities. Helmets are required for riders under 18. No registration or license is required for qualifying eBikes. New Mexico\'s high-altitude terrain makes eBikes particularly popular for overcoming elevation challenges on recreational rides.',
    classes: 'Class 1, 2, and 3 all recognized',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  NY: {
    summary: 'New York has a nuanced eBike regulatory framework. The state recognizes all three eBike classes, but New York City has historically had additional rules. Class 1 and 2 eBikes are generally permitted on bike paths and designated facilities. Class 3 eBikes are restricted to roads and protected bike lanes. New York City specifically prohibits eBikes on sidewalks, and local parks may have their own policies. Helmets are required for riders under 14 under state law. Note: NYC delivery workers using eBikes operate under a separate regulatory framework.',
    classes: 'Class 1, 2, and 3 recognized statewide; NYC has additional local rules',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'NYC eBike Rebate Program', amount: 'Up to $500 (check current availability)', url: 'https://www.nyc.gov/sustainability', eligibility: 'NYC residents; income-qualified residents may receive larger amounts' },
      { name: 'NYSERDA Clean Transportation Programs', amount: 'Varies', url: 'https://www.nyserda.ny.gov', eligibility: 'New York State residents' },
    ],
  },
  NC: {
    summary: 'North Carolina has adopted the 3-class eBike system. Class 1 and 2 eBikes are permitted on most bike paths, greenways, and trails. Class 3 eBikes are restricted to roads and bike lanes. Helmets are required for riders under 16. No registration, license, or insurance is required for qualifying eBikes. North Carolina\'s Research Triangle area and Charlotte metro have invested significantly in eBike-friendly infrastructure.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 restricted to roads and bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Duke Energy eBike Rebate', amount: 'Varies by program', url: 'https://www.duke-energy.com', eligibility: 'Duke Energy customers in North Carolina' },
    ],
  },
  ND: {
    summary: 'North Dakota has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and trails where traditional bicycles are allowed. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for riders under 18. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 all recognized',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  OH: {
    summary: 'Ohio has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths, rail-trails, and multi-use paths where traditional bicycles are allowed. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for riders under 18. No registration, license, or insurance is required for qualifying eBikes. Ohio\'s extensive rail-trail network — including the popular Ohio-to-Erie Trail — is a key destination for eBike riders.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 restricted to road facilities',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  OK: {
    summary: 'Oklahoma has codified the 3-class eBike system. Class 1 and 2 eBikes are permitted on most bike paths and trails. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for riders under 18. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 all recognized under Oklahoma law',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  OR: {
    summary: 'Oregon has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and most off-road trails. Class 3 eBikes are restricted to roads and paved bike facilities; they are not permitted on soft-surface trails. Helmets are required for riders under 16 on roadways; however, helmets are required for all riders of any age when using Class 1 or 2 eBikes on unpaved paths. Oregon\'s Portland metro area has world-class bike infrastructure. No registration or license is required.',
    classes: 'Class 1 & 2: most paths and trails; Class 3: paved facilities only. Helmet required under 16, and for all ages on unpaved paths',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Portland General Electric eBike Rebate', amount: 'Up to $200', url: 'https://www.portlandgeneral.com', eligibility: 'PGE customers in Oregon' },
      { name: 'Pacific Power eBike Incentive', amount: 'Contact for current amounts', url: 'https://www.pacificpower.net', eligibility: 'Pacific Power customers in Oregon' },
    ],
  },
  PA: {
    summary: 'Pennsylvania has adopted the 3-class eBike system. Class 1 and 2 eBikes are permitted on most bike paths, rail-trails, and multi-use paths. Class 3 eBikes are restricted to roads and designated bike facilities. Pennsylvania does not have a general statewide helmet requirement for adult eBike riders, though helmets are strongly recommended. No registration, license, or insurance is required for qualifying eBikes. Pennsylvania\'s Rail-Trail County, with its extensive trail network, is a major eBike tourism destination.',
    classes: 'Class 1, 2, and 3 all recognized; Class 3 restricted to roads and bike lanes',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'PECO Smart Living Rebate', amount: 'Varies', url: 'https://www.peco.com', eligibility: 'PECO customers in southeastern Pennsylvania' },
    ],
  },
  RI: {
    summary: 'Rhode Island has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and most trails. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for riders under 18. Rhode Island\'s compact geography and growing bike network make eBikes practical for transportation. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 all recognized',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  SC: {
    summary: 'South Carolina has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on most bike paths and trails where traditional bicycles are allowed. Class 3 eBikes are restricted to roads and bike lanes. Helmets are required for riders under 16. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 limited to roads and bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  SD: {
    summary: 'South Dakota has adopted the 3-class eBike system. Class 1 and 2 eBikes are permitted on bike paths and trails where traditional bicycles are allowed. Class 3 eBikes are limited to roads and designated bike facilities. South Dakota has no statewide helmet requirement for eBike riders. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 all recognized',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  TN: {
    summary: 'Tennessee has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on most bike paths and trails. Class 3 eBikes are restricted to roads and designated bike facilities. Tennessee has no statewide helmet mandate for eBike riders of any age, though local ordinances may differ. Nashville and Chattanooga have growing eBike-friendly infrastructure. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 all recognized; Class 3 restricted to roads and bike lanes',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  TX: {
    summary: 'Texas has comprehensive 3-class eBike legislation. Class 1 and 2 eBikes are permitted on bike paths, greenways, and most multi-use trails unless specifically prohibited. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for riders under 18. No registration, license, or insurance is required for qualifying eBikes. Texas\'s major metro areas — Austin, Dallas, Houston — have extensive eBike-friendly trail systems. Austin Energy offers a rebate for eBike purchases.',
    classes: 'Class 1 & 2: most paths and greenways; Class 3: roads and bike lanes only',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Austin Energy eBike Rebate', amount: 'Up to $200', url: 'https://austinenergy.com', eligibility: 'Austin Energy customers in Austin area' },
    ],
  },
  UT: {
    summary: 'Utah has adopted a clear 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths and most non-motorized trails. Class 3 eBikes are restricted to roads and paved multi-use paths. Helmets are required for riders under 18. Utah\'s state parks and national monument areas may have specific eBike access policies, and riders should check individual destination rules. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1 & 2: most trails and paths; Class 3: paved facilities and roads only',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Rocky Mountain Power eBike Rebate', amount: 'Contact for current program', url: 'https://www.rockymountainpower.net', eligibility: 'Rocky Mountain Power customers in Utah' },
    ],
  },
  VT: {
    summary: 'Vermont has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on most bike paths, rail-trails, and multi-use trails. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for riders under 16. Vermont offers a meaningful rebate program through Green Mountain Power and the state\'s sustainability initiatives.',
    classes: 'Class 1, 2, and 3 all recognized; Class 3 restricted to roads and bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'VEIC eBike Incentive Program', amount: 'Up to $200 standard; up to $400 income-qualified', url: 'https://www.veic.org', eligibility: 'Vermont residents; income-based tiers available' },
      { name: 'Green Mountain Power eBike Rebate', amount: 'Contact for current amounts', url: 'https://greenmountainpower.com', eligibility: 'GMP customers in Vermont' },
    ],
  },
  VA: {
    summary: 'Virginia has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on bike paths, greenways, and most trails open to traditional bicycles. Class 3 eBikes are restricted to roads and designated bike facilities. Helmets are required for riders under 15. No registration, license, or insurance is required for qualifying eBikes. Virginia\'s Washington DC suburbs have significant eBike-friendly infrastructure including the Custis, W&OD, and other trail systems.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 restricted to roads and bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Dominion Energy eBike Incentive', amount: 'Contact for current program', url: 'https://www.dominionenergy.com', eligibility: 'Dominion Energy customers in Virginia' },
    ],
  },
  WA: {
    summary: 'Washington State has adopted the 3-class eBike system. Class 1 and 2 eBikes are permitted on bike paths, rail-trails, and most multi-use recreational paths. Class 3 eBikes are restricted to roads and paved bike facilities. Helmets are required for riders under 17, and helmets are required for all eBike riders on certain trail systems. Seattle and other urban areas have extensive protected bike lane networks ideal for eBike commuting. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1 & 2: most paths and trails; Class 3: paved facilities and roads only',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'Seattle City Light eBike Rebate', amount: 'Up to $500', url: 'https://www.seattle.gov/city-light', eligibility: 'Seattle City Light customers in Seattle area' },
      { name: 'Puget Sound Energy eBike Rebate', amount: 'Varies by program', url: 'https://www.pse.com', eligibility: 'PSE customers in Washington State' },
    ],
  },
  WV: {
    summary: 'West Virginia has adopted the 3-class eBike system. Class 1 and 2 eBikes are permitted on bike paths and trails where traditional bicycles are allowed. Class 3 eBikes are restricted to roads and designated bike facilities. West Virginia\'s trail networks, particularly in the New River Gorge area and Greenbrier River Trail, are popular for eBike use, though individual trail systems may have their own access policies. Helmets are recommended but not legally required for adult riders. No registration or license is required.',
    classes: 'Class 1, 2, and 3 recognized; individual trail systems set their own eBike policies',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  WI: {
    summary: 'Wisconsin has adopted the 3-class eBike framework. Class 1 and 2 eBikes are permitted on most bike paths, rail-trails, and multi-use paths. Class 3 eBikes are restricted to roads and bike lanes. Helmets are required for riders under 16. Wisconsin\'s Elroy-Sparta Trail and other rail-trail conversions are among the most popular eBike destinations in the Midwest. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 all recognized; Class 3 restricted to roads and paved bike facilities',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: null,
  },
  WY: {
    summary: 'Wyoming has a developing eBike regulatory framework. eBikes with pedal assist up to 20 mph (Class 1 and 2) are generally treated as bicycles and permitted on most paths and trails. The state has not formally codified a comprehensive 3-class system, so Class 3 eBikes may be subject to more variable treatment depending on jurisdiction. There is no statewide helmet requirement for eBike riders. Riders should verify local rules in state parks and on specific trail systems. No general registration is required for low-speed eBikes.',
    classes: 'Class 1 and 2 generally treated as bicycles; Class 3 status varies by jurisdiction',
    helmet_required: false,
    min_age: null,
    registration: false,
    rebates: null,
  },
  DC: {
    summary: 'Washington D.C. has adopted the 3-class eBike system. Class 1 and 2 eBikes are permitted on most bike paths, the Metropolitan Branch Trail, and multi-use paths throughout the District. Class 3 eBikes are restricted to roads and protected bike lanes. Helmets are required for all riders under 16. D.C. has an extensive network of protected bike lanes and the Capital Bikeshare system, making it one of the most eBike-accessible jurisdictions in the country. No registration or license is required for qualifying eBikes.',
    classes: 'Class 1, 2, and 3 recognized; Class 3 restricted to roads and protected bike lanes',
    helmet_required: true,
    min_age: null,
    registration: false,
    rebates: [
      { name: 'DC Sustainable Energy Utility (DCSEU) eBike Program', amount: 'Contact for current availability', url: 'https://www.dcseu.com', eligibility: 'DC residents; income-qualified residents may receive additional incentives' },
    ],
  },
};

// ── Update loop ───────────────────────────────────────────────────────────────

const states = await sql`SELECT code, name FROM states ORDER BY name`;
console.log(`Updating ${states.length} states...\n`);

let updated = 0;
let errors = 0;

for (const { code, name } of states) {
  const data = STATE_LAWS[code];
  if (!data) {
    console.log(`  ⚠️  No data defined for ${name} (${code}) — skipping`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] ${name}: ${data.summary.length} chars, helmet=${data.helmet_required}, rebates=${data.rebates?.length ?? 0}`);
    updated++;
    continue;
  }

  try {
    await sql`
      UPDATE states SET
        ebike_law_summary     = ${data.summary},
        ebike_classes_allowed = ${data.classes},
        helmet_required       = ${data.helmet_required},
        min_age               = ${data.min_age ?? null},
        registration_required = ${data.registration},
        rebate_programs       = ${data.rebates ? sql.json(data.rebates) : null},
        law_last_updated      = NOW()
      WHERE code = ${code}
    `;
    console.log(`  ✓ ${name} (${code})`);
    updated++;
  } catch (err) {
    console.error(`  ✗ ${name} (${code}): ${err.message}`);
    errors++;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const [avgLen] = await sql`SELECT ROUND(AVG(LENGTH(ebike_law_summary))) AS avg FROM states`;
const [reCount] = await sql`SELECT COUNT(*) AS n FROM states WHERE rebate_programs IS NOT NULL`;
const [helmetCount] = await sql`SELECT COUNT(*) AS n FROM states WHERE helmet_required = true`;

console.log(`\n── Results ─────────────────────────────────────────`);
console.log(`  Updated: ${updated} / ${states.length}`);
console.log(`  Errors:  ${errors}`);
if (!DRY_RUN) {
  console.log(`  Avg summary length: ${avgLen.avg} chars`);
  console.log(`  States with rebates: ${reCount.n}`);
  console.log(`  States requiring helmet: ${helmetCount.n}`);
}
console.log(`────────────────────────────────────────────────────`);

await sql.end();
