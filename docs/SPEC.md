# eBikeLocal.com — Technical Specification

> **Version**: 1.0
> **Last Updated**: 2026-04-09
> **Stack**: Astro.js 6.x + Neon DB (Serverless Postgres) + Vercel

---

## 1. Project Overview

**eBikeLocal.com** is a programmatic SEO eBike shop directory that aggregates dealer data across 15+ brands, enriches it with Google Places data, and serves city-level, state-level, brand, and product pages — targeting 15,000–35,000+ monthly searches for city-specific eBike shop queries with virtually no serious competition.

### Core Value Proposition

No independent directory aggregates dealer data across brands. Consumers must visit 20+ brand websites individually to find local shops. **eBikeLocal fills this gap** by answering: "Which eBike brands does this shop carry?" — proprietary data no competitor has.

### Branding

- **Domain**: eBikeLocal.com
- **Tagline**: Find eBike shops, brands, and bikes near you
- **Tone**: Helpful, trustworthy, data-rich — not salesy
- **Visual direction**: Clean, modern, utility-first (think Wirecutter meets Google Maps)

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Astro.js 6.x | Hybrid SSG/SSR, fast builds, excellent SEO output |
| **Database** | Neon DB (Serverless Postgres) | Cost-effective serverless Postgres, PostGIS support, branching for dev/staging, Vercel-native integration |
| **Hosting** | Vercel | Edge network, ISR support, cron jobs, seamless Neon integration |
| **ORM/Driver** | postgres.js (`postgres`) | Lightweight, TypeScript-native, works with Neon connection strings |
| **Styling** | Tailwind CSS 4.x | Utility-first, fast iteration, small bundle |
| **Scraping** | Playwright + Cheerio | Playwright for JS-rendered dealer locators, Cheerio for static HTML |
| **Maps** | Google Maps Embed API / Leaflet.js | Shop location display (Google for single shops, Leaflet for multi-pin city maps to reduce API costs) |
| **Search** | Pagefind (client-side) | Zero-cost static search index built at deploy time |
| **Analytics** | Plausible or Umami (self-hosted) | Privacy-friendly, lightweight |
| **Affiliate Links** | AvantLink API, ShareASale API, Impact API | Programmatic link generation per brand |

### Neon DB Configuration

- **Plan**: Launch tier (usage-based, no monthly minimum)
  - Compute: $0.106/CU-hour, autoscaling to 16 CU
  - Storage: $0.35/GB-month
  - 10 branches included (dev, staging, preview)
  - 7-day restore window
- **Extensions required**: `postgis`, `pg_trgm` (fuzzy text search), `uuid-ossp`
- **Connection**: `postgres.js` via `DATABASE_URL` env var with SSL required
- **Branching strategy**: `main` (production), `dev` (development), preview branches per Vercel deploy

```
DATABASE_URL="postgresql://<user>:<password>@<endpoint>.neon.tech/<dbname>?sslmode=require"
```

### Astro.js Rendering Strategy

| Page Type | Rendering | Reason |
|-----------|-----------|--------|
| Shop listings, city pages, state pages | **SSG** via `getStaticPaths()` | SEO-critical, data changes infrequently |
| Brand pages, bike model pages | **SSG** | SEO-critical, updated on rebuild |
| Homepage, search results | **SSR** (on-demand) | Dynamic content, personalization |
| Guides, informational content | **SSG** | Static editorial content |
| API routes (`/api/*`) | **SSR** | Dynamic data endpoints |

Scheduled nightly rebuilds via **Vercel Cron Jobs** to pick up data changes. Critical updates (new shops, corrections) trigger on-demand ISR revalidation via webhook.

### Required Environment Variables

```
DATABASE_URL=              # Neon connection string (postgres.js)
GOOGLE_PLACES_API_KEY=     # Google Places API (New) key
GOOGLE_MAPS_EMBED_KEY=     # Google Maps Embed API key (separate, restricted)
AVANTLINK_API_KEY=         # AvantLink affiliate API
SHAREASALE_API_TOKEN=      # ShareASale affiliate API
SHAREASALE_API_SECRET=     # ShareASale API secret
IMPACT_ACCOUNT_SID=        # Impact affiliate API
IMPACT_AUTH_TOKEN=         # Impact API auth token
SITE_URL=                  # https://ebikelocal.com (canonical URL)
BUILD_HOOK_SECRET=         # Vercel deploy hook secret for webhooks
```

---

## 3. Database Schema (Neon DB / PostgreSQL)

Adapted from the blueprint's Supabase schema for raw Neon Postgres. Key change: no Supabase RLS/auth — all access is server-side via connection string.

### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Core Tables

#### `shops` — Primary directory listing

```sql
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
  google_business_status TEXT,
  opening_hours JSONB,
  description TEXT,
  is_ebike_specialist BOOLEAN DEFAULT false,
  ebike_confidence_score DECIMAL(3,2),
  services TEXT[],
  shop_type TEXT,
  price_tier TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_claimed BOOLEAN DEFAULT false,
  is_partner BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  featured_image_url TEXT,
  photos TEXT[],
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `brands` — eBike brand directory

```sql
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
  price_range_low INTEGER,
  price_range_high INTEGER,
  affiliate_program_url TEXT,
  affiliate_platform TEXT,
  affiliate_commission_rate DECIMAL(4,2),
  affiliate_cookie_days INTEGER,
  dealer_locator_url TEXT,
  estimated_us_dealers INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `shop_brands` — Junction table (the data moat)

```sql
CREATE TABLE shop_brands (
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  is_authorized_dealer BOOLEAN DEFAULT false,
  dealer_tier TEXT,
  source TEXT,
  verified_at TIMESTAMPTZ,
  PRIMARY KEY (shop_id, brand_id)
);
```

#### `bikes` — Product catalog

```sql
CREATE TABLE bikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  year INTEGER,
  msrp INTEGER,
  sale_price INTEGER,
  category TEXT NOT NULL,
  ebike_class INTEGER CHECK (ebike_class IN (1, 2, 3)),
  motor_watts INTEGER,
  motor_type TEXT,
  motor_torque_nm INTEGER,
  battery_wh INTEGER,
  range_miles_low INTEGER,
  range_miles_high INTEGER,
  top_speed_mph INTEGER,
  charge_time_hours DECIMAL(3,1),
  weight_lbs DECIMAL(4,1),
  max_payload_lbs INTEGER,
  wheel_size TEXT,
  frame_material TEXT,
  frame_types TEXT[],
  gearing TEXT,
  brakes TEXT,
  suspension TEXT,
  has_throttle BOOLEAN,
  has_torque_sensor BOOLEAN,
  has_gps BOOLEAN,
  has_app BOOLEAN,
  has_removable_battery BOOLEAN,
  ul_certified BOOLEAN,
  colors TEXT[],
  key_features TEXT[],
  hero_image_url TEXT,
  gallery_images TEXT[],
  affiliate_url TEXT,
  buy_urls JSONB,
  expert_rating DECIMAL(3,1),
  pros TEXT[],
  cons TEXT[],
  best_for TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `categories` — Taxonomy

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id),
  icon TEXT,
  sort_order INTEGER
);

CREATE TABLE bike_categories (
  bike_id UUID REFERENCES bikes(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (bike_id, category_id)
);
```

#### `states` and `cities` — Geographic pages

```sql
CREATE TABLE states (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  ebike_law_summary TEXT,
  ebike_classes_allowed TEXT,
  helmet_required BOOLEAN,
  min_age INTEGER,
  registration_required BOOLEAN,
  rebate_programs JSONB,
  law_last_updated TIMESTAMPTZ,
  shop_count INTEGER DEFAULT 0
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
  shop_count INTEGER DEFAULT 0,
  has_dedicated_page BOOLEAN DEFAULT false
);
```

#### `reviews` — Native user reviews

```sql
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
```

### Indexes

```sql
CREATE INDEX idx_shops_city_state ON shops(city, state_code);
CREATE INDEX idx_shops_location ON shops USING gist(
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);
CREATE INDEX idx_shops_slug ON shops(slug);
CREATE INDEX idx_shops_google_place_id ON shops(google_place_id);
CREATE INDEX idx_shops_ebike_confidence ON shops(ebike_confidence_score DESC);
CREATE INDEX idx_bikes_brand ON bikes(brand_id);
CREATE INDEX idx_bikes_category ON bikes(category);
CREATE INDEX idx_bikes_slug ON bikes(slug);
CREATE INDEX idx_shop_brands_shop ON shop_brands(shop_id);
CREATE INDEX idx_shop_brands_brand ON shop_brands(brand_id);
CREATE INDEX idx_cities_state ON cities(state_code);
CREATE INDEX idx_cities_slug ON cities(slug);
CREATE INDEX idx_reviews_shop ON reviews(shop_id);
CREATE INDEX idx_shops_name_trgm ON shops USING gin(name gin_trgm_ops);
```

---

## 4. Site Architecture & URL Structure

```
/ ....................................... Homepage (SSR — search + featured)
/shops/ ................................. National directory hub (SSG)
/shops/[state-slug]/ ................... State page (SSG, 50 pages)
/shops/[state-slug]/[city-slug]/ ....... City page (SSG, 200+ pages)
/shops/[state-slug]/[city-slug]/[shop]/ . Shop listing (SSG, 3,000+ pages)

/brands/ ................................ Brand directory hub (SSG)
/brands/[brand-slug]/ .................. Brand page (SSG, 15+ pages)
/brands/[brand-slug]/dealers/ .......... Brand dealer finder (SSR)

/bikes/ ................................. Product catalog hub (SSG)
/bikes/[brand-slug]/[model-slug]/ ...... Model page (SSG)

/categories/ ............................ Category hub (SSG)
/categories/[category-slug]/ ........... Category page (SSG)

/best/ .................................. Buying guide hub (SSG)
/best/[topic-slug]/ .................... Guide page (SSG)

/guides/ ................................ Informational content hub (SSG)
/guides/[topic-slug]/ .................. Guide page (SSG)
/guides/ebike-laws/[state-slug]/ ....... State law page (SSG, 50 pages)

/api/search ............................. Shop search endpoint (SSR)
/api/suggest ............................ Autocomplete endpoint (SSR)
```

**Estimated page count at launch**: ~3,300 pages (50 state + 200 city + 3,000 shop + 15 brand + ~35 guides/categories)

---

## 5. Data Sourcing Strategy

### 5.1 Brand Dealer Locator Scraping

Each brand's dealer locator must be scraped or queried to build the `shop_brands` junction table. Below are the specific data access methods per brand.

#### Tier 1: Shopify-based (JS-rendered, use Playwright)

| Brand | Locator URL | Est. US Dealers | Access Method |
|-------|-------------|-----------------|---------------|
| **Aventon** | `aventon.com/pages/electric-bike-shop-dealer-locator` | 1,800+ | Playwright — JS renders via Shopify store locator app. Intercept XHR for JSON dealer data. Also has city SEO pages at `/pages/ebikes-in/{city}`. |
| **Lectric eBikes** | `lectricebikes.com/a/store-locator/` | 500+ | **Stockist app** (stockist.co) — Query `app.stockist.co/api/v1/{tag}/locations/search?lat=...&lng=...` for JSON results. Fields: name, address, phone, email, website, category tags (Test Ride, Retail, Rent). |
| **Rad Power Bikes** | `radpowerbikes.com/pages/locations` | 1,200+ service partners | Playwright. **Status uncertain** — acquired by Life EV in early 2026 after Chapter 11. Verify operational status before heavy scraping. |
| **Velotric** | `velotricbike.com/pages/find-a-dealer` | 1,200+ | Playwright — has model-specific dealer finder pages. Look for "Showcase Store" designations. |
| **Pedego** | `dealers.pedegoelectricbikes.com/pages/dealers/{city}` | 200+ franchise stores | Franchise microsites on Shopify Liquid templates. Richest individual dealer pages of any brand — product listings, rental info, local content. Crawl the sitemap. |

#### Tier 2: Enterprise platforms (richest data, custom scraping required)

| Brand | Locator URL | Est. US Dealers | Access Method |
|-------|-------------|-----------------|---------------|
| **Trek** | `trekbikes.com/us/en_US/store-finder/` | 1,500–2,000+ | Vue.js SPA. **Best API candidate** — intercept internal REST API calls returning JSON. Monitor network tab for `/api/` endpoints during search. |
| **Specialized** | `specialized.com/us/en/store-finder` | 1,000+ | Custom build with Amplience CMS. Playwright required. Filter by "Open Now" and store features. |
| **Giant** | `giant-bicycles.com/us/stores` | ~1,224 | **Most granular filtering** — capability badges for E-Bike Service, Fitting, Rentals, Demo Events, Group Rides. Playwright + intercept API calls. |

#### Tier 3: Third-party platforms (structured APIs available)

| Brand | Platform | Locator URL | Est. US Dealers | Access Method |
|-------|----------|-------------|-----------------|---------------|
| **Cannondale** | **Locally.com** | `locally.com` integration | 1,000+ | Locally.com widget API — query `api.locally.com/stores/search?...` with brand filter. Returns JSON with real-time inventory and pricing. **Most structured API of all brands.** |
| **Gazelle** | Locally.com + Magento | `locally.com/brand/gazelle-bikes` | 60–70 US | Locally.com API (same as Cannondale) + Magento locator fallback. |
| **BULLS Bikes** | **Beeline Connect** | Beeline-powered locator | 50–100 stocking (2,500+ assembly/service via Beeline network) | Beeline Connect "Dynamic Dealer Locator" — look for `beelineconnect.com` or `beelinebikes.com` API endpoints in network requests. |
| **Priority Bicycles** | Beeline Connect | Beeline-powered locator | 50+ | Same Beeline Connect platform as BULLS. |
| **Tern** | Custom (Drupal) | `ternbicycles.com/us/dealers/map` | 100–200+ | Individual dealer pages at `/us/dealers/{id}`. "Preferred Dealer" badges. Cheerio sufficient — Drupal renders server-side. |
| **Riese & Muller** | Google Maps API | `r-m.de/en-us/dealer-search/` | 50–100 | Google Maps API overlay. Three dealer tiers: Regular, Experience Store, Cargo Hub. Intercept Google Maps marker data or API calls. |
| **Electric Bike Company** | Legacy embed | `legacy.electricbikecompany.com/embed/dealermap2.html` | Unknown | **Returned 402 error** in research. HQ and Newport Beach showroom show "CLOSED" on Yelp. Low priority — verify operational status. |

#### Locally.com API (Cannondale, Gazelle)

Locally.com provides the most structured dealer data of any platform. Their widget-based API endpoints:

- **Store search**: `https://api.locally.com/stores/search?company_id={id}&lat={lat}&lng={lng}&radius={mi}`
- **Fields returned**: Store name, address, phone, distance, hours, real-time in-stock inventory with pricing
- **Rate limiting**: Respectful crawling required; no published rate limits
- **Key advantage**: Inventory data — which specific bike models are in stock at each dealer

#### Stockist API (Lectric eBikes)

Stockist.co (used by Shopify stores) exposes a public search API:

- **Endpoint**: `https://app.stockist.co/api/v1/{store_tag}/locations/search`
- **Parameters**: `lat`, `lng`, `distance` (radius in miles)
- **Fields**: Name, address, city, state, zip, phone, email, website, custom tags, coordinates

### 5.2 Google Places API (New)

Primary source for enriching shop data and discovering non-brand-affiliated eBike shops.

#### Strategy

1. **Discovery phase** (~11,300 Text Search requests):
   - ~400 US metro areas x 4 query variants x ~2 pages = 3,200 requests
   - ~2,500 rural grid points x 2 queries x 1.5 pages = 7,500 requests
   - 50 state-level queries = 600 requests

2. **Enrichment phase** (~5,000 Place Details requests):
   - Phone, website, hours, rating, reviews for each discovered shop

3. **Photo phase** (~5,000 requests):
   - 1 primary photo per shop listing

#### Query Configuration

```
Text Search (Pro tier):
  textQuery: "electric bike shop" | "ebike dealer" | "e-bike store" | "electric bicycle shop"
  includedType: "bicycle_store"
  locationBias: { circle: { center: { lat, lng }, radius: 50000 } }
  maxResultCount: 20
```

#### Pricing (Post-March 2025 structure)

| Phase | Requests | Est. Cost |
|-------|----------|-----------|
| Discovery (Text Search Pro) | ~11,300 | ~$76 |
| Details (Enterprise tier) | ~5,000 | ~$80 |
| Photos | ~5,000 | ~$28 |
| Reviews | ~5,000 | ~$100 |
| **Total one-time seed** | **~26,300** | **~$284** |

Monthly refresh: ~$80/month for re-checking all shops.

#### Required Fields by Tier

- **Essentials** (free caps): `formattedAddress`, `location` (lat/lng), `types`
- **Pro**: `displayName`, `photos`, `businessStatus`, `googleMapsUri`
- **Enterprise** (required): `internationalPhoneNumber`, `websiteUri`, `currentOpeningHours`, `rating`, `reviews`, `userRatingCount`

#### ToS Compliance

- Must display data alongside a Google Map
- Include proper attribution
- Re-validate cached data within 30 days
- Cannot create a "replacement database" (Section 3.2.3) — always link back to Google Maps

### 5.3 Supplementary Data Sources

| Source | Cost | Coverage | Use Case |
|--------|------|----------|----------|
| **OpenStreetMap** (Overpass API) | Free | US bicycle shops tagged `shop=bicycle`, some with `service:bicycle:electric=yes` | Baseline free data, cross-reference with Google |
| **Foursquare Places API** | Free (250K calls/month) | Bicycle stores | Supplementary discovery and verification |
| **Bing Places API** | Free (10K transactions/month) | Bicycle stores | Additional data points for deduplication confidence |

### 5.4 eBike Classification Pipeline

Google has no `electric_bicycle_store` type. Multi-signal classification:

1. **Text query signal** — shops found via eBike-specific queries get base score 0.3
2. **Review text analysis** — scan Google reviews for eBike brand mentions (+0.2)
3. **Website scrape** — check shop's `websiteUri` for eBike keywords (+0.2)
4. **Brand dealer cross-reference** — found in any brand locator (+0.3, auto-confirms)
5. **Google summary** — check `editorialSummary`/`generativeSummary` for eBike mentions (+0.1)

**Threshold**: `ebike_confidence_score >= 0.5` for inclusion; `>= 0.8` for `is_ebike_specialist = true`

---

## 6. eBike Taxonomy

### Primary Categories

| Category | Slug | Description |
|----------|------|-------------|
| Commuter / City | `commuter` | Daily transportation, integrated lights/fenders |
| Cruiser | `cruiser` | Beach/leisure, upright position, comfort-focused |
| Cargo | `cargo` | Extended frames for hauling kids/groceries/gear |
| Folding | `folding` | Compact, foldable for apartments and transit |
| Mountain / eMTB | `mountain` | Full suspension, trail-ready |
| Fat Tire | `fat-tire` | 4"+ tires for sand, snow, all-terrain |
| Road / Gravel | `road-gravel` | Drop-bar, lightweight, long road rides |
| Moped-Style | `moped-style` | Motorcycle-inspired aesthetics |
| Hunting / Off-Road Utility | `hunting` | High payload, designed for hunters |
| Step-Through | `step-through` | Low frame entry for accessibility |

### E-Bike Class System

| Class | Pedal Assist | Throttle | Max Speed | Trail Access |
|-------|-------------|----------|-----------|-------------|
| Class 1 | Yes (to 20 mph) | No | 20 mph | Most bike paths and trails |
| Class 2 | Yes (to 20 mph) | Yes (to 20 mph) | 20 mph | Most bike paths; some trail restrictions |
| Class 3 | Yes (to 28 mph) | Varies | 28 mph | Roads and bike lanes only |

### Secondary Filter Dimensions

- **Motor type**: hub drive, mid-drive
- **Frame type**: step-over, step-through, folding
- **Price tier**: budget (<$1,000), mid-range ($1,000–$2,500), premium ($2,500+)
- **Use case tags**: commuting, recreation, exercise, delivery, family transport
- **Feature flags**: throttle, torque sensor, GPS, app connectivity, removable battery, UL 2849 certified

---

## 7. SEO Strategy

### Keyword Priority (by opportunity)

1. **Long-tail local** (VERY HIGH opportunity, LOW competition): "eBike shops in [city]" — 15K–35K monthly searches aggregate
2. **Informational** (HIGH opportunity, LOW-MEDIUM competition): "eBike tax credit 2026" — 10K–20K/mo; "eBike laws by state" — 8K–15K/mo
3. **"Near me"** (HIGH volume, MEDIUM competition): "electric bike shops near me" — 12K–22K/mo
4. **Brand intent** (HIGH value, MEDIUM competition): "[Brand] review" — 2K–10K/mo each
5. **Product research** (HIGH volume, VERY HIGH competition): "best electric bike" — 30K–60K/mo — deprioritize until month 6+

### Schema.org Structured Data

Every page type gets appropriate JSON-LD markup:

#### Shop Listings — `BikeStore` (subtype of `LocalBusiness > Store`)

```json
{
  "@context": "https://schema.org",
  "@type": "BikeStore",
  "name": "Shop Name",
  "address": { "@type": "PostalAddress", ... },
  "geo": { "@type": "GeoCoordinates", "latitude": ..., "longitude": ... },
  "telephone": "...",
  "url": "...",
  "openingHoursSpecification": [...],
  "aggregateRating": { "@type": "AggregateRating", ... },
  "review": [...]
}
```

The `BikeStore` type inherits from `Thing > Organization > LocalBusiness > Store > BikeStore` and supports: `name`, `description`, `address`, `telephone`, `email`, `url`, `openingHours`, `openingHoursSpecification`, `geo`, `aggregateRating`, `review`, `priceRange`, `makesOffer`, `hasOfferCatalog`, `logo`, `photo`, `areaServed`, `paymentAccepted`, `currenciesAccepted`.

#### Product Pages — `Product`

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Aventon Pace 500",
  "brand": { "@type": "Brand", "name": "Aventon" },
  "offers": { "@type": "AggregateOffer", "lowPrice": ..., "highPrice": ... },
  "aggregateRating": { ... },
  "review": [...]
}
```

#### Navigation — `BreadcrumbList`

All directory pages get breadcrumb markup: `Home > Shops > California > Los Angeles > Shop Name`

#### Guide Pages — `FAQPage`

Informational guides with Q&A sections get FAQ schema for rich snippets.

### Programmatic Page Templates

**City page** (`/shops/california/los-angeles/`):
- H1: "eBike Shops in Los Angeles, California"
- Shop count, top brands available, services summary
- Map with all shop pins (Leaflet.js)
- Filterable shop list (by brand, service, rating)
- "Brands available in Los Angeles" section (from `shop_brands` data)
- California eBike law summary with link to full state law page
- Nearby cities with eBike shops

**State page** (`/shops/california/`):
- H1: "eBike Shops in California"
- State map with city markers
- City list with shop counts
- State eBike law detail section
- Rebate/incentive programs

**Shop listing** (`/shops/california/los-angeles/pedego-huntington-beach/`):
- H1: Shop name
- Address, phone, hours, map
- Brands carried (from `shop_brands`) — **unique differentiator**
- Services offered
- Google rating + native reviews
- "Buy from [Brand] online" affiliate CTAs
- Nearby shops

---

## 8. Affiliate Integration

### Programs by Platform

#### AvantLink (Primary — most eBike brands)

| Brand | Commission | Cookie | Est. Earning/Sale |
|-------|-----------|--------|-------------------|
| Electric Bike Company | Up to 15% | 30 days | $300–$525 |
| EVELO | 6% / 3% returning | 30 days | $180–$330 |
| QuietKat | 5% | 30 days | $100–$262 |
| Blix Bikes | 6–10% | 45 days | $84–$220 |
| Aventon | 4% | 30 days | $44–$100 |
| Rad Power Bikes | Up to 5% | 30 days | $60–$80 (verify post-acquisition) |
| Lectric eBikes | ~3% | 30 days | $24–$45 |

**AvantLink API** (REST architecture):
- Custom Link Builder for programmatic affiliate link generation
- Product Data API for product search, price checking, datafeed access
- Reporting API for conversion tracking
- Auth: API Authorization Key generated in account settings

#### ShareASale

| Brand | Commission | Cookie | Est. Earning/Sale |
|-------|-----------|--------|-------------------|
| Himiway | 5–7.5% (tiered) | 7 days | $50–$187 |
| Engwe | 5–6% | 30 days | $59–$71 |
| Heybike | 3% | 30 days | $18–$57 |

#### Impact

| Brand | Commission | Cookie | Est. Earning/Sale |
|-------|-----------|--------|-------------------|
| Velotric | 7% + bonuses | 30 days | $70–$161 |

#### Other

| Brand | Platform | Commission | Cookie |
|-------|----------|-----------|--------|
| Ride1UP | Tune (direct) | 5% | 30 days |
| Super73 | CJ Affiliate | 2.4% | — |
| Tenways | Awin/CJ | 5% US / 3% global | — |
| Buzz Bicycles | Direct | 10% | 60 days |
| REI (Co-op Cycles) | AvantLink | 5% | 15 days |

### Affiliate Link Placement Strategy

- **Shop listing pages**: "Buy [Brand] online" buttons when shop carries a brand with an affiliate program
- **Bike model pages**: Multiple retailer CTA buttons ("$1,599 at Aventon" / "$1,599 at REI")
- **Brand pages**: "Shop [Brand] Online" primary CTA
- **Buying guides**: Product cards with "Check Price at [Brand]" buttons
- **Category pages**: Top picks with affiliate-linked product cards

### Amazon Associates (Supplemental)

- Sports & Outdoors category: 3–4% commission
- 24-hour cookie (very short)
- Use only for budget brands sold on Amazon (Heybike, Engwe, Hyper Bicycles)

---

## 9. Product Showcase Design

### Product Card Component

Visual hierarchy (top to bottom):
1. Large product image (white/neutral background)
2. Award badge overlay (corner) — "Best Commuter", "Best Value"
3. Bold product name
4. Prominent price (with strikethrough for sales)
5. Numerical score in colored badge
6. 2–3 key specs as icon+value pairs: `750W | 720 Wh | 38 mi`
7. "Best For" one-line tag
8. CTA button: "Check Price at [Brand]" (not "Buy Now")

### Brand Page Structure (`/brands/aventon/`)

Following RTINGS.com model:
1. Brand header with logo + 2–3 sentence overview
2. Quick stats bar: model count, price range, avg rating, categories
3. "Best Of" picks from brand (top 3 mini product cards)
4. Filterable/sortable all-models grid
5. Side-by-side spec comparison table
6. Brand info: warranty, support, where to buy
7. Cross-links to city pages where brand has dealers

### Comparison Table Fields

Essential fields for eBike comparison tables (per ElectricBikeReview.com pattern):
- Image, MSRP, star rating, summary, check-price button
- Sub-scores: Ride Quality, Components, Range, Hill Climbing
- Specs: e-bike class, motor output, torque, battery Wh, top speed, weight, warranty
- "Show/Hide full specifications" toggle

### Mobile Behavior

- Collapse specs into expandable accordions
- Sticky CTA button at viewport bottom
- Swipeable product card carousel on category pages
- Touch-friendly filter chips

---

## 10. Content Strategy

### Launch Content (Month 1–2)

| Content Type | Count | Template |
|-------------|-------|----------|
| State pages | 50 | Programmatic from `states` table |
| City pages | 200 | Programmatic from `cities` + `shops` tables |
| Shop listings | 3,000+ | Programmatic from `shops` + `shop_brands` tables |
| Brand pages | 15 | Semi-programmatic from `brands` + `bikes` tables |
| "eBike Tax Credit 2026" guide | 1 | Editorial |
| "eBike Laws by State" hub | 1 | Editorial + programmatic state sub-pages |
| "eBike Classes Explained" | 1 | Editorial |
| "How to Choose an eBike" buying guide | 1 | Editorial |

### Month 2–4

- Expand to 200+ city pages
- 10 additional informational articles
- eBike class explainer content
- State law sub-pages (50 programmatic)

### Month 3–6

- Brand comparison content
- "Best eBikes Under $X" guides (3–5 price tiers)
- Category landing pages (10 categories)
- Begin model-specific review content

### Month 6+

- Head-term content ("best electric bike") once domain authority established
- User-generated reviews system
- "Claim Your Listing" shop owner portal

---

## 11. Scraping Infrastructure

### Technology

- **Playwright** (Node.js): For JS-rendered sites (Aventon, Velotric, Trek, Specialized, Giant, Rad)
- **Cheerio** (Node.js): For server-rendered HTML (Tern/Drupal, Pedego sitemaps)
- **Direct HTTP/JSON**: For API-based sources (Locally.com, Stockist, Beeline Connect)

### Scraping Pipeline Architecture

```
[Scheduler (Vercel Cron)] → [Scraper Workers (Node.js scripts)]
                                    ↓
                           [Raw Data Staging Table]
                                    ↓
                           [Deduplication Engine]
                             (normalize address + fuzzy name match)
                                    ↓
                           [eBike Classification Pipeline]
                             (confidence scoring 0.0–1.0)
                                    ↓
                           [Production Tables]
                             (shops, shop_brands, bikes)
                                    ↓
                           [Vercel Build Trigger]
                             (rebuild static pages)
```

### Deduplication Strategy

Match shops across sources using:
1. `google_place_id` (exact match — highest confidence)
2. Normalized address comparison (strip suite numbers, standardize abbreviations)
3. Fuzzy name match via `pg_trgm` similarity (threshold: 0.6)
4. Coordinate proximity (<50m) + name similarity

### Ethical Scraping Practices

- Respect `robots.txt` for all domains
- Rate limit: max 1 request/second per domain
- Identify as `eBikeLocalBot/1.0` in User-Agent
- Cache responses to avoid redundant requests
- Prefer APIs over scraping when available (Locally.com, Stockist, Google Places)

---

## 12. Revenue Model

### Revenue Streams (Priority Order)

1. **Affiliate commissions** ($44–$525 per sale): Primary revenue from month 1
2. **Display ads** (Monumetric at 10K sessions, Mediavine at 50K): Month 6+ when traffic threshold met
3. **Verified Partner listings** ($75–$150/month per shop): Month 6+ after proving traffic value
4. **Paid listing submissions** ($50 one-time): Low priority, supplement

### Revenue Projections

| Metric | Month 6 | Month 12 | Month 18 |
|--------|---------|----------|----------|
| Organic traffic | 8K–20K | 25K–60K | 50K–150K |
| Affiliate revenue | $300–$1,800 | $1,100–$6,000 | $2,300–$15,000 |
| Display ad revenue | $0 | $200–$900 | $500–$2,250 |
| Paid listings | $0–$250 | $250–$3,750 | $1,125–$9,000 |
| **Total monthly** | **$300–$2,050** | **$1,550–$10,650** | **$3,925–$26,250** |

---

## 13. Competitive Landscape

### electricbikeshops.com (Primary Competitor)

- ~900 listings, WordPress + Directorist plugin
- **Weaknesses**: Identical templated paragraphs on every listing (duplicate content), keyword-stuffed URL slugs, no city-level pages, no brands-carried data, no native reviews, empty fields on many listings
- Monetized via CJ affiliate banners and paid submissions

### Other Competitors (Non-Factors)

- **ElectricBikeReview.com**: Paid/sponsored directory only, no geographic browsing
- **electric-bikes.com**: Static HTML dealer list organized by area code (relic)
- **PeopleForBikes.org**: Retail directory returns 404
- **NBDA**: Members-only, behind paywall

### Our Differentiation

1. **Brands-carried data** — no competitor has this
2. **City-level programmatic pages** — no competitor targets these
3. **Real enriched data** — not auto-generated duplicate content
4. **Modern stack** — fast, accessible, mobile-first
5. **Schema markup** — structured data for rich search results

---

## 14. Estimated Costs

### One-Time

| Item | Cost |
|------|------|
| Google Places API (seed 5,000 shops) | ~$284 |
| Domain (eBikeLocal.com) | ~$12/year |
| **Total one-time** | **~$296** |

### Monthly Operating

| Item | Cost |
|------|------|
| Neon DB (Launch tier, estimated usage) | ~$20–$50/month |
| Vercel Pro | ~$20/month |
| Google Places refresh | ~$80/month |
| Plausible Analytics | ~$9/month |
| **Total monthly** | **~$129–$159/month** |

---

## 15. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Google algo volatility for programmatic SEO | High | Genuine unique data per page (brands carried, local law context), no templated filler |
| Google Places ToS violation | High | Always display with Google Maps, attribute properly, re-validate within 30 days |
| Brand locator structure changes | Medium | Monitor scraper health, alert on failures, maintain fallback manual entry |
| Rad Power Bikes/Electric Bike Company instability | Low | Flag uncertain brands, diversify affiliate portfolio |
| Seasonal traffic troughs (winter) | Medium | Target Feb–Mar launch to ride summer peak; informational content is less seasonal |
| Competitor emerges with similar data | Low | First-mover advantage on brands-carried data; build community/reviews moat |
