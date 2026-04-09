# The complete blueprint for an eBike shop directory

**A programmatic SEO eBike directory is a wide-open opportunity with almost no serious competition.** The primary competitor (electricbikesshops.com) has ~900 scraped listings with auto-generated duplicate content, no city-level pages, and no brand-carried data. No independent directory aggregates dealer data across brands — consumers currently must visit 20+ brand websites individually to find local shops. Combined with **15,000–35,000 monthly searches** for city-specific eBike shop queries alone, strong affiliate economics ($44–$525 per sale), and a market growing 46% year-over-year, this project has a realistic path to $3,000–$8,000/month revenue within 18 months.

This report covers every research dimension: brand dealer locator data, Google Places API strategy, competitive landscape, affiliate programs, product showcase design, taxonomy, SEO keyword mapping, and a complete implementation plan with database schema, architecture, timeline, and revenue projections.

---

## Research task 1: Brand dealer locator data across 15 brands

All 15 brands were researched for dealer locator pages, data structure, and scrapeability. The findings reveal three distinct platform patterns that inform your data-sourcing strategy.

### Shopify-based DTC brands (easiest to work with)

**Aventon** has the largest eBike-specific dealer network at **1,800+ US shops**, accessible via `aventon.com/pages/electric-bike-shop-dealer-locator`. They also maintain city-specific SEO landing pages at `/pages/ebikes-in/{city}`. Data loads dynamically via JavaScript (likely a Shopify store locator app). Fields include shop name, address, distance, and a test ride badge.

**Lectric eBikes** uses the Stockist Shopify app (identified by the `/a/store-locator/` URL pattern) with individual store pages containing name, address, phone, email, website, and category tags (Test Ride, Retail, Rent). They're primarily DTC but expanding retail through Best Buy and independent partners.

**Rad Power Bikes** filed Chapter 11 bankruptcy in December 2025 and was acquired by Life EV in early 2026. Their locations page at `radpowerbikes.com/pages/locations` lists company-owned RadRetail stores plus **1,200+ service partners**. Current status of the dealer network is in transition.

**Velotric** lists **1,200+ partner shops** at `velotricbike.com/pages/find-a-dealer` with a unique feature: model-specific dealer finder pages that filter by which stores carry specific bikes. They also designate "Showcase Stores" that stock the full collection.

**Pedego** operates a **franchise model with 200+ branded stores**, each getting a full microsite at `dealers.pedegoelectricbikes.com/pages/dealers/{city}`. These franchise pages are the richest individual dealer pages of any brand — containing product listings, rental info, and local content using Shopify Liquid templates.

### Enterprise custom builds (richest data, harder to access)

**Trek** has a Vue.js SPA at `trekbikes.com/us/en_US/store-finder/` with an estimated **1,500–2,000+ authorized retailers**. Data loads via internal REST API returning JSON — the most likely candidate for structured API access among all brands researched.

**Specialized** runs a custom enterprise locator at `specialized.com/us/en/store-finder` with filtering by "Open Now" and store features. Content delivered via Amplience CMS. Their dealer network numbers in the thousands.

**Giant** has the **most granular filtering system** of any brand at `giant-bicycles.com/us/stores`, with capability badges for E-Bike Service certified, Fitting Services, Premium Assembly, Suspension Service, Rentals, Demo Events, and Group Rides. ScrapeHero has documented **~1,224 US locations** as of January 2025.

### Third-party platform brands (structured APIs available)

**Cannondale** uses **Locally.com** for its "Shop Locally" pages, which provides real-time in-stock inventory with pricing via a well-documented API. This is the most structured, API-accessible dealer data of any brand researched. An estimated **1,000+ US dealers** are listed.

**Gazelle** also appears on Locally.com (`locally.com/brand/gazelle-bikes`) alongside a custom Magento-based locator showing **~86 results** (60–70 US stores). Fields include dealer name, address, phone, and distance.

**BULLS Bikes** and **Priority Bicycles** both use the **Beeline Connect** platform, which provides a "Dynamic Dealer Locator" with structured data across thousands of assembly/service locations. BULLS claims **2,500+ partner shops** (via Beeline network), though dedicated stocking dealers likely number 50–100.

**Tern** runs a custom Drupal-based system at `ternbicycles.com/us/dealers/map` with individual dealer pages at `/us/dealers/{id}` and "Preferred Dealer" badges. Estimated **100–200+ US dealers**.

**Riese & Müller** uses Google Maps API directly at `r-m.de/en-us/dealer-search/` with three dealer tiers: Regular Dealers, Experience Stores, and Cargo Hubs. An estimated **50–100 selective US dealers**.

**Electric Bike Company** has a legacy Google Maps embed at `legacy.electricbikecompany.com/embed/dealermap2.html` (returned 402 error). Notably, their Costa Mesa HQ and Newport Beach showroom both show "CLOSED" on Yelp as of early 2026, and they're not accepting new dealer applications.

### Common data fields across all brands

**Universal fields** (available from every brand): dealer name, street address, city/state/zip, map pin/coordinates. **Common fields** (most brands): phone number, distance from search point, dealer type/tier designation. **Rare fields** (1–2 brands only): website URL, hours of operation, in-stock inventory, services offered. **No brand provides**: brands carried by dealer, email address, or native customer reviews.

This gap — **no brand tells you what OTHER brands a dealer carries** — is the single biggest data quality opportunity for your directory.

---

## Research task 2: Google Places API strategy for seeding 5,000 shops

### Search strategy and coverage

The Places API (New) Text Search endpoint is your primary tool. Use `includedType: "bicycle_store"` combined with eBike-specific text queries ("electric bike shop", "ebike dealer", "e-bike store") to filter results. Each request returns up to **20 results per page** with pagination.

For systematic US coverage, the recommended approach combines **~400 metro areas** (4 query variants × ~2 pages = 3,200 requests), **~2,500 grid points** for rural coverage (2 queries × 1.5 pages = 7,500 requests), and **50 state-level queries** (600 requests). Total discovery phase: **~11,300 Text Search requests**. Deduplicate on Google's `place_id` field.

### Fields and pricing tiers

To get the fields a directory needs (name, address, phone, website, hours, rating), you **must use the Enterprise tier** — phone (`internationalPhoneNumber`), website (`websiteUri`), hours (`currentOpeningHours`), and rating are all Enterprise-level fields. The Essentials tier covers only address and coordinates. The Pro tier adds `displayName`, `photos` references, `businessStatus`, and `googleMapsUri`.

Post-March 2025 pricing replaced the old $200/month credit with per-SKU free monthly caps:

| Phase | Requests | Estimated cost |
|-------|----------|---------------|
| Discovery (Text Search Pro) | ~11,300 | ~$76 |
| Details (Enterprise) | ~5,000 | ~$80 |
| Photos | ~5,000 | ~$28 |
| Reviews (Enterprise+Atmosphere) | ~5,000 | ~$100 |
| **Total one-time seed** | **~26,300** | **~$284** |

Monthly refresh runs ~$80/month for re-checking all 5,000 shops. The **Starter subscription plan ($100/month for 50,000 calls)** may be more cost-effective for the initial seed if you spread work across 2–3 months.

### The eBike classification challenge

Google has no `electric_bicycle_store` type — only `bicycle_store`. To determine if a shop specifically sells eBikes, use a multi-signal pipeline: (1) search with eBike-specific text queries first, (2) analyze the `reviews` text for eBike brand mentions, (3) scrape the shop's `websiteUri` for eBike keywords, (4) cross-reference with brand dealer locators, and (5) check Google's `generativeSummary` or `editorialSummary` fields.

### Complementary data sources worth integrating

**OpenStreetMap** (free, query via Overpass API) provides a baseline of US bicycle shops tagged `shop=bicycle`, with some tagged `service:bicycle:electric=yes`. Coverage is inconsistent but costs nothing. **Foursquare Places API** offers a generous 250K calls/month free tier. **Bing Places API** provides 10,000 free transactions/month. The **Locally.com** platform used by Cannondale and Gazelle provides the most structured dealer+inventory data and could be a partnership opportunity.

### Terms of service warning

Google's ToS (Section 3.2.3) restricts using Places data to create a replacement database. You must display data alongside a Google Map, include proper attribution, and re-validate cached data within 30 days.

---

## Research task 3: Competitive landscape is remarkably weak

### electricbikesshops.com (primary competitor)

This WordPress-based directory claims **~900 listings** across the US, Canada, UK, Ireland, Mexico, and Netherlands. It uses a directory plugin (likely Directorist) with state-level pages at `/loc/[state-name]/` and individual listings at `/bikeshop/[shop-name-city-state]/`. The URL slugs are extremely long and keyword-stuffed (e.g., `/bikeshop/ob-ebikes-ebike-super-shop-san-diego-e-bike-store-e-bike-service-repair-near-you-bicycle-store-in-san-diegocalifornia/`).

**Critical weaknesses**: Every listing uses the identical templated paragraph ("Discover [Shop Name], your go-to electric bike shop in [City], [State]...") — classic thin, duplicate content. Some listings have empty city/state fields. Data appears bulk-scraped from Google Maps without verification. **No city-level pages exist** — only state pages. No information about brands carried, services offered, or native reviews. Monetized via CJ affiliate banners and paid listing submissions.

### Other competitors are non-factors

**ElectricBikeReview.com** has a shop directory as a secondary feature, but it's **paid/sponsored placements only** with no geographic browsing, no SEO-optimized listing pages, and no consumer search functionality. **electric-bikes.com** has an extremely basic static HTML dealer list organized by area code — a relic site. **PeopleForBikes.org** returned a 404 for its retail directory. **NBDA** (National Bicycle Dealers Association) only lists dues-paying members behind a membership wall.

### The opportunity in five words

**No one aggregates brand data.** Every brand maintains its own siloed dealer locator. No directory tells consumers which brands a specific shop carries. No competitor has dedicated city-level pages. No competitor verifies or enriches listing data beyond what Google Maps provides. The competitive bar is extraordinarily low.

---

## Research task 4: eBike affiliate programs deliver $44–$525 per sale

The eBike affiliate landscape is dominated by **AvantLink** (premium DTC brands), **ShareASale** (mid-market), and **Impact** (growing). Commission rates range from 3%–15%, with most programs at **4%–7%**. The high average order values ($1,000–$4,000+) make even modest percentages lucrative.

### Top programs ranked by earnings potential

| Brand | Commission | Typical sale | Est. earning/sale | Platform | Cookie |
|-------|-----------|-------------|-------------------|----------|--------|
| **Electric Bike Company** | Up to 15% | $2,000–$3,500 | **$300–$525** | AvantLink | 30 days |
| **EVELO** | 6% new / 3% returning | $3,000–$5,500 | **$180–$330** | AvantLink | 30 days |
| **QuietKat** | 5% | $2,000–$5,249 | **$100–$262** | AvantLink | 30 days |
| **Blix Bikes** | 6–10% | $1,400–$2,200 | **$84–$220** | AvantLink | **45 days** |
| **Himiway** | 5–7.5% (tiered) | $999–$2,499 | **$50–$187** | ShareASale | 7 days |
| **Velotric** | 7% + monthly bonuses | $999–$2,299 | **$70–$161** | Impact | 30 days |
| **Ride1UP** | 5% | $1,045–$2,495 | **$52–$125** | Tune (direct) | 30 days |
| **Aventon** | 4% | $1,099–$2,499 | **$44–$100** | AvantLink | 30 days |
| **Engwe** | 5–6% | ~$1,182 avg | **$59–$71** | ShareASale | 30 days |
| **Rad Power Bikes** | Up to 5% | ~$1,599 | **$60–$80** | AvantLink | 30 days ⚠️ |
| **Lectric eBikes** | ~3% | $799–$1,499 | **$24–$45** | AvantLink | 30 days |
| **Heybike** | 3% | $599–$1,899 | **$18–$57** | ShareASale | 30 days |
| **Hyper Bicycles** | ~1–4% via Walmart/Amazon | $348–$598 | **$3–$24** | Walmart/Amazon | 24 hrs |

### Key program notes

**Rad Power Bikes** filed Chapter 11 in December 2025 and was acquired by Life EV — affiliate program status is uncertain. **Juiced Bikes** went bankrupt in late 2024, was acquired by Lectric eBikes co-founders, and is relaunching Spring 2026 with no current affiliate program. **Velotric** offers the best overall package: competitive 7% rate, monthly performance bonuses, and a growing brand on the reliable Impact platform. **Blix Bikes** has the longest cookie at **45 days**. **Electric Bike Company** offers the highest per-sale earnings but their Costa Mesa locations show as closed on Yelp — verify operational status before promoting heavily.

Additional brands with confirmed programs include **Super73** (2.4% via CJ, low rate), **Tenways** (5% US / 3% global via Awin/CJ), **Buzz Bicycles** (10% direct, 60-day cookie — the best cookie duration), and **Co-op Cycles via REI** (5% via AvantLink, 15-day cookie). **Sondors** offers only an owner referral program, not a traditional affiliate program.

For Amazon Associates, eBikes fall under Sports & Outdoors at **3–4%** with only a **24-hour cookie** — significantly worse than brand-direct programs. Use Amazon only for budget brands (Heybike, Engwe) that sell there.

---

## Research task 5: Product showcase design patterns that convert

### Wirecutter's proven product card formula

Wirecutter structures category reviews with a bold intro that immediately names the #1 pick, followed by a "Quick Look" summary grid as a table of contents, then individual product sections labeled by use case ("Best for Commuters"). Each product recommendation includes an award badge, product image, one-sentence summary, **red CTA buttons showing retailer name + price** (e.g., "$1,599 at Aventon"), and a brief review. They show **2–3 affiliate buttons per product** with different retailers — Google's product review guidelines favor sites offering multiple purchase options.

### ElectricBikeReview.com's comparison table approach

EBR's comparison tables are the most data-rich in the eBike space, displaying: product image, MSRP, star rating, bottom-line summary, check-price button, sub-scores (Ride Quality, Components, Screen/App, Range, Hill Climbing), overall score out of 100, e-bike class, motor output, motor torque, battery Wh, top speed, suggested use, total weight, warranty, and frame colors — with a "Show/Hide full specification details" toggle.

### Essential data fields for eBike product listings

Based on cross-referencing OutdoorGearLab, EBR, Wirecutter, and brand pages, the ideal eBike product listing requires these field groups:

**Core identification**: model name, brand, year, category/use case, e-bike class (1/2/3). **Pricing**: MSRP, sale price, price tier (budget/mid/premium). **Motor & battery** (most critical specs): motor power (nominal watts), motor type (hub vs. mid-drive), motor torque (Nm), battery capacity (Wh), estimated range (miles), tested range (miles), top speed (mph), charge time (hours). **Physical specs**: total weight, max payload, wheel/tire size, frame material, frame type (step-over/step-through/folding), available sizes, rider height range. **Commerce**: affiliate links (multiple retailers), warranty info, available colors. **Ratings**: expert score, sub-scores, pros/cons, user rating, "Best For" label, award badges.

### Recommended brand page structure (/brands/aventon/)

The brand page should follow RTINGS.com's model: brand header with logo and 2–3 sentence overview, quick stats bar (number of models, price range, average rating, categories covered), "Best Of" picks from the brand (top 3 with mini product cards), a filterable/sortable all-models grid, a side-by-side spec comparison table, brand info section (warranty, customer support, where to buy), and cross-links to city pages where brand has dealers and buying guides where brand products appear.

### Product card design principles

Effective cards follow this visual hierarchy from top to bottom: large product image (white/neutral background), award badge overlaid on corner, bold product name, prominent price (with strikethrough for sales), numerical score in colored badge, **2–3 key specs as icon+value pairs** (⚡ 750W | 🔋 720 Wh | 📏 38 mi), a "Best For" one-line tag, and a contrasting CTA button reading "Check Price at [Brand]" (not "Buy Now" — implies comparison shopping and feels less aggressive). On mobile, collapse specs into expandable accordions and use sticky CTA buttons at the viewport bottom.

---

## Research task 6: eBike taxonomy and classification system

### Standard industry categories

The eBike industry uses these primary categories, which should form the top-level taxonomy:

- **Commuter/City** — Designed for daily transportation, typically lighter frames, integrated lights/fenders, moderate range. Largest market segment.
- **Cruiser** — Beach/leisure-style, upright riding position, comfort-focused. Popular with older demographics. (Pedego, Electric Bike Company specialize here.)
- **Cargo** — Extended frames or longtails for hauling kids/groceries/gear. Growing segment. (Tern GSD, Rad Power RadWagon, Aventon Abound.)
- **Folding** — Compact, foldable for apartment storage and multimodal commuting. (Lectric XP, Tern Vektron, Brompton Electric.)
- **Mountain/eMTB** — Full suspension, knobby tires, designed for trail riding. Premium segment. (Specialized Turbo Levo, Trek Powerfly.)
- **Fat tire** — 4"+ tires for sand, snow, and all-terrain. Very popular in the DTC/budget segment. (Himiway, Aventon Aventure.)
- **Road/Gravel** — Drop-bar, lightweight, designed for long road rides. Smaller niche. (Giant Defy Advanced, Specialized Turbo Creo.)
- **Moped-style** — Motorcycle-inspired aesthetics, typically Class 2 with throttle. (Super73, Juiced Bikes.)
- **Hunting/Off-road utility** — Camo patterns, high payload, designed for hunters and outdoor workers. (QuietKat.)
- **Step-through** — Low frame entry point for accessibility, popular with older riders. (Gazelle, Pedego.)

### E-bike class system (critical for legal compliance content)

| Class | Pedal assist | Throttle | Max speed | Where allowed |
|-------|-------------|----------|-----------|---------------|
| **Class 1** | Yes (up to 20 mph) | No | 20 mph | Most bike paths, trails, multi-use paths |
| **Class 2** | Yes (up to 20 mph) | Yes (up to 20 mph) | 20 mph | Most bike paths; some trail restrictions |
| **Class 3** | Yes (up to 28 mph) | Sometimes (varies) | 28 mph | Roads and bike lanes; restricted from many trails and paths |

**Why this matters for a directory**: Trail and path access rules **vary by state and even by municipality**. Some National Parks allow Class 1 only. Some states (like New Jersey, which recently reclassified all eBikes as motorized vehicles) have completely different frameworks. State law pages on your site should detail which classes are allowed where — this is a **high-value, low-competition content opportunity** with 200–2,000 searches per state per month.

### Secondary taxonomy dimensions

Beyond category and class, structure the database with these filterable attributes: **motor type** (hub drive vs. mid-drive), **frame type** (step-over, step-through, folding), **price tier** (budget under $1,000, mid-range $1,000–$2,500, premium $2,500+), **use case tags** (commuting, recreation, exercise, delivery, family transport), and **feature flags** (throttle, torque sensor, GPS tracking, app connectivity, removable battery, UL 2849 certified).

---

## Research task 7: SEO keyword map reveals massive gaps

### The single most important finding

**City-specific eBike shop queries have LOW competition and HIGH aggregate volume.** No dominant independent directory ranks for these terms below the Google Local Pack. Brand dealer locators capture some of this traffic but only for their own brands. Your programmatic city pages would face almost no competition.

### Keyword clusters ranked by opportunity

**Cluster 1 — Long-tail local (VERY HIGH opportunity, LOW competition)**:
"eBike shops in [city]" across the top 200 US cities represents an estimated **15,000–35,000 monthly searches** in aggregate. "Electric bike repair [city]", "ebike rental [city]", "ebike test ride [city]", and "used ebikes [city]" add another **11,000–28,000 monthly searches**. Almost no one targets these specifically.

**Cluster 2 — Informational content (HIGH opportunity, LOW-MEDIUM competition)**:
"eBike tax credit 2026" alone generates **10,000–20,000 searches/month**. "eBike laws by state" generates **8,000–15,000/month**. State-specific law queries add another **5,000–15,000/month** across all 50 states. Current rankers are mostly small eBike brand blogs with low authority — highly beatable.

**Cluster 3 — "Near me" queries (HIGH volume, MEDIUM competition)**:
"Electric bike shops near me" generates **12,000–22,000 monthly searches**. "eBike shops near me" adds **8,000–15,000**. These are dominated by the Google Local Pack and Yelp, but a well-structured directory with proper schema markup can capture organic positions below the pack.

**Cluster 4 — Brand/model intent (HIGH value, MEDIUM competition)**:
Brand review queries ("Aventon review", "Lectric XP review") generate **2,000–10,000/month each**. Your unique angle: combining brand/model information with "find a dealer near you" CTAs — no review site currently offers this.

**Cluster 5 — Product research (HIGH volume, VERY HIGH competition)**:
"Best electric bike" generates **30,000–60,000/month** but is dominated by Bicycling.com, TechRadar, Wired, and Tom's Guide. Deprioritize these until site authority is established (month 6+). Sub-$X price queries ("best ebike under $1500") at **5,000–15,000/month each** are more achievable.

### Recommended content launch sequence

**Month 1–2**: 50 city pages + 50 state pages (programmatic) + "eBike tax credit 2026" guide + "eBike laws by state" hub page. **Month 2–4**: 15–20 brand pages + eBike classes explainer + buying guide + 10 more informational articles. **Month 3–6**: Expand to 200+ city pages + brand comparison content + "best ebikes under $X" guides. **Month 6+**: Model-specific reviews and head-term content as authority grows.

---

## Final synthesis: Implementation plan

### 1. Recommended Supabase database schema

```sql
-- Core shops table (Google Places + brand dealer data)
CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT UNIQUE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  state_code CHAR(2) NOT NULL,
  zip TEXT,
  country CHAR(2) DEFAULT 'US',
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  phone TEXT,
  website TEXT,
  email TEXT,
  google_maps_uri TEXT,
  google_rating DECIMAL(2,1),
  google_review_count INTEGER,
  google_business_status TEXT, -- OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY
  opening_hours JSONB, -- structured hours per day
  description TEXT, -- editorial, NOT auto-generated
  is_ebike_specialist BOOLEAN DEFAULT false, -- confirmed eBike focus
  ebike_confidence_score DECIMAL(3,2), -- 0.00–1.00 confidence it sells eBikes
  services TEXT[], -- ARRAY: sales, repair, rental, test_rides, fitting, assembly
  shop_type TEXT, -- independent, franchise, brand_owned, big_box
  price_tier TEXT, -- budget, mid_range, premium
  is_verified BOOLEAN DEFAULT false,
  is_claimed BOOLEAN DEFAULT false,
  is_partner BOOLEAN DEFAULT false, -- paid Verified Partner tier
  verified_at TIMESTAMPTZ,
  featured_image_url TEXT,
  photos TEXT[], -- array of photo URLs
  source TEXT, -- google_places, brand_scrape, manual, user_submitted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brands table
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  website TEXT,
  description TEXT,
  founded_year INTEGER,
  headquarters TEXT,
  country_of_origin TEXT,
  price_range_low INTEGER, -- in USD
  price_range_high INTEGER,
  affiliate_program_url TEXT,
  affiliate_platform TEXT, -- avantlink, shareasale, impact, direct
  affiliate_commission_rate DECIMAL(4,2), -- percentage
  affiliate_cookie_days INTEGER,
  dealer_locator_url TEXT,
  estimated_us_dealers INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shop-Brand junction (which brands each shop carries)
CREATE TABLE shop_brands (
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  is_authorized_dealer BOOLEAN DEFAULT false,
  dealer_tier TEXT, -- preferred, authorized, experience_store, etc.
  source TEXT, -- brand_locator, user_reported, shop_claimed, website_scrape
  verified_at TIMESTAMPTZ,
  PRIMARY KEY (shop_id, brand_id)
);

-- Bike models table
CREATE TABLE bikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  year INTEGER,
  msrp INTEGER, -- in cents
  sale_price INTEGER,
  category TEXT NOT NULL, -- commuter, cargo, mountain, folding, fat_tire, cruiser, road, moped_style
  ebike_class INTEGER CHECK (ebike_class IN (1, 2, 3)),
  motor_watts INTEGER, -- nominal
  motor_type TEXT, -- hub, mid_drive
  motor_torque_nm INTEGER,
  battery_wh INTEGER,
  range_miles_low INTEGER, -- manufacturer estimated range
  range_miles_high INTEGER,
  top_speed_mph INTEGER,
  charge_time_hours DECIMAL(3,1),
  weight_lbs DECIMAL(4,1),
  max_payload_lbs INTEGER,
  wheel_size TEXT, -- e.g., "27.5 x 2.2"
  frame_material TEXT, -- aluminum, carbon, steel
  frame_types TEXT[], -- step_over, step_through, folding
  gearing TEXT, -- e.g., "Shimano 8-speed"
  brakes TEXT, -- hydraulic_disc, mechanical_disc
  suspension TEXT, -- none, front, full
  has_throttle BOOLEAN,
  has_torque_sensor BOOLEAN,
  has_gps BOOLEAN,
  has_app BOOLEAN,
  has_removable_battery BOOLEAN,
  ul_certified BOOLEAN, -- UL 2849
  colors TEXT[],
  key_features TEXT[],
  hero_image_url TEXT,
  gallery_images TEXT[],
  affiliate_url TEXT,
  buy_urls JSONB, -- {"brand_direct": "...", "amazon": "...", "rei": "..."}
  expert_rating DECIMAL(3,1), -- out of 10
  pros TEXT[],
  cons TEXT[],
  best_for TEXT, -- "Best for commuters", "Best value", etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories lookup
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- e.g., "Commuter"
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id), -- for subcategories
  icon TEXT,
  sort_order INTEGER
);

-- Bike-Category junction (bikes can belong to multiple categories)
CREATE TABLE bike_categories (
  bike_id UUID REFERENCES bikes(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (bike_id, category_id)
);

-- Geographic lookup tables for programmatic pages
CREATE TABLE states (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  ebike_law_summary TEXT,
  ebike_classes_allowed TEXT, -- descriptive summary
  helmet_required BOOLEAN,
  min_age INTEGER,
  registration_required BOOLEAN,
  rebate_programs JSONB, -- array of {name, amount, url, eligibility}
  law_last_updated TIMESTAMPTZ,
  shop_count INTEGER DEFAULT 0 -- denormalized for performance
);

CREATE TABLE cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  state_code CHAR(2) REFERENCES states(code),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  population INTEGER,
  metro_area TEXT,
  shop_count INTEGER DEFAULT 0, -- denormalized
  has_dedicated_page BOOLEAN DEFAULT false
);

-- User reviews (native review system)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_name TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  visit_date DATE,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_shops_city_state ON shops(city, state_code);
CREATE INDEX idx_shops_location ON shops USING gist(
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
); -- requires PostGIS
CREATE INDEX idx_shops_google_place_id ON shops(google_place_id);
CREATE INDEX idx_bikes_brand ON bikes(brand_id);
CREATE INDEX idx_bikes_category ON bikes(category);
CREATE INDEX idx_shop_brands_shop ON shop_brands(shop_id);
CREATE INDEX idx_shop_brands_brand ON shop_brands(brand_id);
```

### 2. Site architecture and URL structure

```
/ (homepage — national search + featured shops + latest content)

/shops/ (national directory hub)
/shops/[state-slug]/ (state page — e.g., /shops/california/)
/shops/[state-slug]/[city-slug]/ (city page — e.g., /shops/california/los-angeles/)
/shops/[state-slug]/[city-slug]/[shop-slug]/ (individual listing — e.g., /shops/california/los-angeles/pedego-huntington-beach/)

/brands/ (brand directory hub)
/brands/[brand-slug]/ (brand page — e.g., /brands/aventon/)
/brands/[brand-slug]/dealers/ (brand dealer finder — e.g., /brands/aventon/dealers/)

/bikes/ (product catalog hub)
/bikes/[brand-slug]/[model-slug]/ (model page — e.g., /bikes/aventon/pace-500/)

/categories/ (category hub)
/categories/[category-slug]/ (category page — e.g., /categories/commuter/)

/best/ (comparison/buying guide hub)
/best/[topic-slug]/ (guide — e.g., /best/ebikes-under-1500/)

/guides/ (informational content hub)
/guides/[topic-slug]/ (guide — e.g., /guides/ebike-laws-by-state/)
/guides/ebike-laws/[state-slug]/ (state law page — e.g., /guides/ebike-laws/california/)

/reviews/ (model reviews)
/reviews/[model-slug]/ (review — e.g., /reviews/aventon-pace-500/)
```

**Astro SSG implementation**: Use `getStaticPaths()` to generate all pages at build time from Supabase data. City pages and state pages are generated programmatically from the `shops`, `cities`, and `states` tables. Build-time queries aggregate shop counts, brand presence, and service availability per location. Trigger rebuilds via Supabase webhooks when data changes, or schedule nightly rebuilds via Vercel cron jobs.

**Page type count at launch**: ~50 state pages + ~200 city pages + ~15 brand pages + ~3,000 shop listing pages + ~20 informational guides + ~10 buying guides = **~3,300 pages** at launch, scaling to 5,000+ within 6 months.

### 3. Realistic timeline to seed 3,000+ shops

| Week | Milestone | Details |
|------|-----------|---------|
| **1–2** | Database schema + scraping pipeline | Set up Supabase tables, build Google Places API ingestion scripts, build brand dealer locator scrapers |
| **2–3** | Brand dealer locator scraping | Scrape Aventon (1,800), Velotric (1,200), Pedego (200+), Giant (~1,224), Trek (via ScrapeHero or manual), Specialized, Cannondale (via Locally.com API). **Estimated yield: 4,000–6,000 raw dealer records across brands** |
| **3–4** | Google Places API sweep | Run ~11,300 Text Search queries + 5,000 Place Details enrichment. **Estimated yield: 4,000–6,000 bicycle shops** (not all will be eBike-specific) |
| **4–5** | Deduplication + classification | Match brand dealer data against Google Places data on normalized address + name fuzzy match. Run eBike classification pipeline (review text analysis, website scraping, name matching). **Target: 3,000+ confirmed eBike-relevant shops** |
| **5–6** | Data enrichment | Add brands-carried data from dealer locator cross-references. Populate shop_brands junction table. Fill in missing hours, photos, descriptions for top-priority listings |
| **6–8** | Site build + content | Build Astro templates for all page types. Generate 50 state pages + 200 city pages + 15 brand pages. Write 10 informational guides (laws, tax credit, buying guide) |
| **8** | **Launch** | Deploy to Vercel. Submit sitemap to Google Search Console. Begin link building |

**Total time to launch with 3,000+ shops: 8 weeks** (aggressive) to **12 weeks** (comfortable). The bottleneck is not data collection — it's data enrichment and the eBike classification pipeline. Google Places API data can be collected in 2–3 days; brand dealer scraping takes 1–2 weeks depending on JS rendering complexity.

**Total data cost**: ~$284 (Google Places) + ~$0 (brand scraping) + ~$100/month (Supabase Pro) + ~$20/month (Vercel Pro) = **~$400 one-time + ~$120/month operating costs**.

### 4. Revenue projection: months 6, 12, and 18

**Assumptions**: Launch at week 8, steady content publishing, standard SEO ramp-up (3–6 months to index and rank programmatic pages), affiliate conversion rate of 0.5–1% of relevant traffic, display ad RPM of $8–$15 for Monumetric/Mediavine.

#### Month 6 (after launch)

| Metric | Conservative | Optimistic |
|--------|-------------|-----------|
| **Indexed pages** | 3,500 | 4,000 |
| **Monthly organic traffic** | 8,000 | 20,000 |
| **Display ad revenue** | $0 (below Monumetric threshold) | $0 (building toward 10K threshold) |
| **Affiliate clicks** | 400 | 1,200 |
| **Affiliate conversions** | 4–8 | 12–24 |
| **Affiliate revenue** | $300–$600 | $900–$1,800 |
| **Paid listings** | 0–2 ($50/mo each) | 3–5 ($50/mo each) |
| **Total monthly revenue** | **$300–$700** | **$1,050–$2,050** |

At month 6, you're in the "investment phase." Traffic is building but hasn't crossed the 10,000 sessions/month threshold needed for Monumetric. Focus on content velocity and link building.

#### Month 12

| Metric | Conservative | Optimistic |
|--------|-------------|-----------|
| **Indexed pages** | 5,000 | 6,000 |
| **Monthly organic traffic** | 25,000 | 60,000 |
| **Display ad revenue (Monumetric)** | $200–$375 (RPM $8–$15) | $480–$900 |
| **Affiliate clicks** | 1,500 | 4,000 |
| **Affiliate conversions** | 15–30 | 40–80 |
| **Affiliate revenue** | $1,100–$2,300 | $3,000–$6,000 |
| **Paid listings** | 5–10 ($50–$100/mo) | 15–25 ($50–$150/mo) |
| **Paid listing revenue** | $250–$1,000 | $1,000–$3,750 |
| **Total monthly revenue** | **$1,550–$3,675** | **$4,480–$10,650** |

At month 12, you should qualify for Monumetric (10K sessions/month minimum) and possibly approach Mediavine's **50,000 sessions/month** threshold in the optimistic case. Affiliate revenue becomes meaningful as brand and product pages start ranking.

#### Month 18

| Metric | Conservative | Optimistic |
|--------|-------------|-----------|
| **Indexed pages** | 6,000+ | 8,000+ |
| **Monthly organic traffic** | 50,000 | 150,000 |
| **Display ad revenue (Mediavine)** | $500–$750 | $1,500–$2,250 |
| **Affiliate conversions** | 30–60 | 100–200 |
| **Affiliate revenue** | $2,300–$4,500 | $7,500–$15,000 |
| **Paid listings** | 15–30 ($75–$150/mo) | 40–60 ($75–$150/mo) |
| **Paid listing revenue** | $1,125–$4,500 | $3,000–$9,000 |
| **Total monthly revenue** | **$3,925–$9,750** | **$12,000–$26,250** |

At month 18, the site should qualify for **Mediavine** (50K sessions) in the conservative case. The optimistic case assumes strong summer 2027 seasonal traffic (eBike searches peak April–August with a ~29% surge). Paid partner listings become the most scalable revenue stream as you prove lead generation value to shops.

### Key revenue levers and risks

**Biggest upside lever**: The shop_brands junction table (which brands each shop carries). This is proprietary data no competitor has. It enables "[Brand] dealers near [city]" pages that capture high-intent, low-competition queries — and these pages naturally convert to affiliate clicks when paired with "Buy direct from [Brand]" buttons.

**Biggest risk**: Google algorithm volatility for programmatic SEO. Mitigate by ensuring every page has genuine unique value — real shop data, brand-carried information, local law context, user reviews — not templated filler content. The auto-generated descriptions that killed electricbikesshops.com's quality should serve as a warning.

**Seasonal consideration**: eBike traffic peaks in summer and troughs in winter. Month 6 revenue depends heavily on WHEN you launch — a March launch means month 6 hits September (still strong); a September launch means month 6 hits March (trough). Target a **February–March launch** to hit your stride as seasonal traffic ramps.

## Conclusion: Three moves that determine success

**First, own the "brands carried" data layer.** No competitor, no brand locator, and no Google Maps listing tells consumers which eBike brands a shop carries. Building this junction table — via brand dealer locator cross-referencing, shop website scraping, and a "claim your listing" flow where shops self-report — creates an unassailable data moat and enables the highest-converting page types on the site.

**Second, prioritize city pages and informational content over product reviews at launch.** The keyword research is unambiguous: long-tail local queries and eBike law/tax credit content have the lowest competition and fastest path to ranking. Product review content ("best ebike under $1500") should come after the site has established domain authority through its directory pages — attempting to compete with Bicycling.com and TechRadar on day one is a losing strategy.

**Third, treat the Verified Partner program as the long-term revenue engine.** Display ads and affiliate commissions will fund early operations, but the real business model is charging shops $75–$150/month for enhanced listings with analytics dashboards, featured placement, and verified badges. At 50 paying partners, that's $3,750–$7,500/month in high-margin recurring revenue — more predictable than affiliate commissions and independent of Google algorithm changes. Build the free directory first, prove traffic value, then upsell.