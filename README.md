# eBikeLocal.com

**Find eBike shops, brands, and bikes near you.**

A programmatic SEO eBike shop directory that aggregates dealer data across 15+ brands, enriches it with Google Places data, and serves city-level, state-level, brand, and product pages. Targets 15,000–35,000+ monthly searches for city-specific eBike shop queries with virtually no serious competition.

**Core differentiator**: No independent directory tells consumers which eBike brands a shop carries. eBikeLocal fills that gap via a `shop_brands` junction table built from cross-referencing brand dealer locators.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro.js 6.x (hybrid SSG/SSR) |
| Database | Neon DB (Serverless Postgres) |
| Hosting | Vercel (edge network, cron jobs) |
| DB Driver | postgres.js |
| Styling | Tailwind CSS 4.x |
| Scraping | Playwright + Cheerio |
| Maps | Google Maps Embed API (single shop) / Leaflet.js (multi-pin city maps) |

---

## File Tree

```
eBikeLocal/
├── public/
│   ├── favicon.svg
│   └── logos/
│       └── brands/              # Brand logo assets (SVG/PNG)
│           ├── aventon.png
│           ├── cannondale.svg
│           ├── giant.svg
│           ├── lectric.svg
│           ├── pedego.png
│           ├── rad-power-bikes.png
│           ├── specialized.svg
│           ├── trek.svg
│           └── ...              # (16 brands total)
│
├── src/
│   ├── components/
│   │   ├── seo/                 # Structured data (JSON-LD) components
│   │   │   ├── BikeStoreSchema.astro    # LocalBusiness schema for shops
│   │   │   ├── BreadcrumbSchema.astro   # BreadcrumbList schema
│   │   │   ├── FAQSchema.astro          # FAQPage schema for guides
│   │   │   ├── JsonLd.astro             # Generic JSON-LD wrapper
│   │   │   ├── MetaTags.astro           # <head> meta tags + OG tags
│   │   │   └── ProductSchema.astro      # Product schema for bike models
│   │   └── ui/                  # Reusable UI components
│   │       ├── AwardBadge.astro         # "Best For X" badge overlay
│   │       ├── BikeCard.astro           # Product card (image, specs, CTA)
│   │       ├── BrandBadge.astro         # Brand logo pill
│   │       ├── Breadcrumb.astro         # Navigation breadcrumbs
│   │       ├── CTAButton.astro          # Affiliate CTA button
│   │       ├── FilterBar.astro          # Category/brand/service filter strip
│   │       ├── MapEmbed.astro           # Google Maps Embed (single shop)
│   │       ├── MultiPinMap.astro        # Leaflet.js map (city/state pages)
│   │       ├── PageHeader.astro         # H1 + subtitle page header
│   │       ├── Pagination.astro         # Page navigation
│   │       ├── RatingStars.astro        # Star rating display
│   │       ├── SearchBar.astro          # Autocomplete search input
│   │       ├── ServiceTag.astro         # Service chip (Test Ride, Repair, etc.)
│   │       ├── ShopCard.astro           # Shop listing card
│   │       └── SpecRow.astro            # Key/value spec row for bike specs
│   │
│   ├── layouts/
│   │   └── BaseLayout.astro     # Root layout (nav, footer, global styles)
│   │
│   ├── lib/
│   │   ├── brandLogos.ts        # Brand slug → logo URL mapping
│   │   └── neon.ts              # Neon DB client (postgres.js connection)
│   │
│   ├── pages/
│   │   ├── index.astro          # Homepage — SSR (search + featured shops)
│   │   │
│   │   ├── shops/               # Shop directory
│   │   │   ├── index.astro                            # National hub (SSG)
│   │   │   └── [stateSlug]/
│   │   │       ├── index.astro                        # State page (SSG, 50 pages)
│   │   │       └── [citySlug]/
│   │   │           ├── index.astro                    # City page (SSG, 200+ pages)
│   │   │           └── [shopSlug].astro               # Shop listing (SSG, 3,000+ pages)
│   │   │
│   │   ├── brands/              # Brand directory
│   │   │   ├── index.astro                            # Brand hub (SSG)
│   │   │   └── [brandSlug]/
│   │   │       ├── index.astro                        # Brand page (SSG)
│   │   │       └── dealers.astro                      # Brand dealer finder (SSR)
│   │   │
│   │   ├── bikes/               # Product catalog
│   │   │   ├── index.astro                            # Catalog hub (SSG)
│   │   │   └── [brandSlug]/
│   │   │       └── [modelSlug].astro                  # Model page (SSG)
│   │   │
│   │   ├── categories/          # eBike categories
│   │   │   ├── index.astro                            # Category hub (SSG)
│   │   │   └── [categorySlug].astro                   # Category page (SSG)
│   │   │
│   │   ├── best/                # Buying guides hub
│   │   │   └── index.astro
│   │   │
│   │   ├── guides/              # Informational content
│   │   │   ├── index.astro                            # Guides hub (SSG)
│   │   │   └── ebike-laws/
│   │   │       └── [stateSlug].astro                  # State law pages (SSG, 50 pages)
│   │   │
│   │   ├── api/                 # Server-side API routes (SSR)
│   │   │   ├── search.ts        # Shop search endpoint
│   │   │   ├── suggest.ts       # Autocomplete suggestions
│   │   │   └── rebuild.ts       # Webhook-triggered Vercel rebuild
│   │   │
│   │   ├── sitemap.xml.ts       # Dynamic sitemap generation
│   │   └── robots.txt.ts        # robots.txt generation
│   │
│   ├── styles/
│   │   └── global.css           # Global Tailwind + base styles
│   │
│   └── env.d.ts                 # Astro/TypeScript env type declarations
│
├── scripts/
│   ├── schema.sql               # Full database schema (Neon DB / PostgreSQL)
│   ├── add-staging-table.sql    # Staging table for raw scrape data
│   ├── run-schema.mjs           # Applies schema.sql to Neon DB
│   ├── run-sql.mjs              # Utility: run arbitrary SQL against Neon DB
│   ├── seed-brands.mjs          # Seeds the `brands` table
│   ├── seed-categories.mjs      # Seeds the `categories` table
│   ├── seed-states.mjs          # Seeds the `states` table
│   └── scrapers/
│       ├── run-all.mjs          # Runs all brand scrapers sequentially
│       ├── utils.mjs            # Shared scraper utilities
│       ├── aventon.mjs          # Aventon dealer locator scraper (1,800+ shops)
│       ├── giant.mjs            # Giant bicycles scraper (~1,224 shops)
│       ├── lectric.mjs          # Lectric eBikes — Stockist API
│       ├── locally.mjs          # Locally.com API (Cannondale, Gazelle)
│       ├── pedego.mjs           # Pedego franchise microsites
│       ├── rad.mjs              # Rad Power Bikes locations
│       ├── specialized.mjs      # Specialized store finder
│       ├── tern.mjs             # Tern Bicycles dealer pages
│       ├── trek.mjs             # Trek store finder API
│       ├── velotric.mjs         # Velotric dealer locator
│       ├── shop-logos.mjs       # Fetches shop logo images
│       └── google-places.mjs    # Google Places API discovery + enrichment
│
├── docs/
│   ├── blueprint.md             # Business research: market, competitors, revenue projections
│   ├── SPEC.md                  # Technical specification (stack, schema, SEO strategy)
│   └── ACTION.md                # Development action plan / task tracker
│
├── astro.config.mjs             # Astro configuration (static output, Vercel adapter)
├── tsconfig.json                # TypeScript configuration
├── package.json                 # Dependencies and npm scripts
├── .env.example                 # Environment variable template
└── .gitignore
```

---

## URL Structure

```
/                                 Homepage (SSR)
/shops/                           National directory hub
/shops/[state]/                   State page — e.g. /shops/california/
/shops/[state]/[city]/            City page — e.g. /shops/california/los-angeles/
/shops/[state]/[city]/[shop]/     Shop listing — e.g. /shops/california/los-angeles/pedego-venice/

/brands/                          Brand directory hub
/brands/[brand]/                  Brand page — e.g. /brands/aventon/
/brands/[brand]/dealers/          Brand dealer finder (SSR)

/bikes/                           Product catalog hub
/bikes/[brand]/[model]/           Model page — e.g. /bikes/aventon/pace-500/

/categories/                      Category hub
/categories/[category]/           Category page — e.g. /categories/commuter/

/best/                            Buying guide hub
/guides/                          Informational content hub
/guides/ebike-laws/[state]/       State eBike law page — e.g. /guides/ebike-laws/california/

/api/search                       Shop search endpoint (SSR)
/api/suggest                      Autocomplete endpoint (SSR)
```

Estimated page count at launch: ~3,300 pages (50 state + 200+ city + 3,000+ shop + 15 brand + guides/categories).

---

## Database Schema

The Neon DB (Serverless Postgres) schema lives in `scripts/schema.sql`. Key tables:

| Table | Purpose |
|-------|---------|
| `shops` | Primary directory listing (address, coords, hours, rating, services) |
| `brands` | eBike brand directory with affiliate program data |
| `shop_brands` | **Junction table** — which brands each shop carries (the data moat) |
| `bikes` | Product catalog with full spec data |
| `categories` | Taxonomy (commuter, cargo, mountain, folding, fat-tire, etc.) |
| `bike_categories` | Bike ↔ category many-to-many |
| `states` | Geographic pages + eBike law data per state |
| `cities` | City-level geographic data with shop counts |
| `reviews` | Native user reviews |

Required PostgreSQL extensions: `postgis`, `pg_trgm`, `uuid-ossp`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```
DATABASE_URL=          # Neon DB connection string
GOOGLE_PLACES_API_KEY= # Google Places API (New) — data pipeline
GOOGLE_MAPS_EMBED_KEY= # Google Maps Embed API — map display (separate restricted key)
AVANTLINK_API_KEY=     # AvantLink affiliate API (Aventon, Lectric, EVELO, QuietKat, etc.)
SHAREASALE_API_TOKEN=  # ShareASale affiliate API (Himiway, Engwe, Heybike)
SHAREASALE_API_SECRET= # ShareASale API secret
IMPACT_ACCOUNT_SID=    # Impact affiliate API (Velotric)
IMPACT_AUTH_TOKEN=     # Impact API auth token
SITE_URL=              # https://ebikelocal.com
BUILD_HOOK_SECRET=     # Vercel deploy hook secret for webhook rebuilds
```

---

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Database Setup

```bash
# Apply schema to Neon DB
npm run db:schema

# Seed reference data
npm run seed              # runs seed:states + seed:categories + seed:brands
npm run seed:states
npm run seed:categories
npm run seed:brands
```

### Data Pipeline — Scraping

```bash
# Run all brand scrapers
npm run scrape

# Run individual brand scrapers
npm run scrape:aventon
npm run scrape:lectric
npm run scrape:velotric
npm run scrape:pedego
npm run scrape:rad
npm run scrape:trek
npm run scrape:giant
npm run scrape:specialized
npm run scrape:tern
```

Each scraper writes raw results to a staging table, which feeds into a deduplication and eBike confidence-scoring pipeline before records are promoted to the production `shops` table.

---

## Data Sources

| Source | Method | Est. US Shops |
|--------|--------|--------------|
| Aventon | Playwright (JS-rendered Shopify) | 1,800+ |
| Velotric | Playwright | 1,200+ |
| Rad Power Bikes | Playwright | 1,200+ service partners |
| Trek | Intercept internal REST API (Vue SPA) | 1,500–2,000+ |
| Specialized | Playwright | 1,000+ |
| Giant | Playwright + API intercept | ~1,224 |
| Cannondale / Gazelle | Locally.com API | 1,000+ / 60–70 |
| Lectric eBikes | Stockist.co API | 500+ |
| Pedego | Cheerio (Shopify Liquid microsites) | 200+ franchise stores |
| Tern | Cheerio (Drupal server-rendered) | 100–200+ |
| Google Places | Places API (New) Text Search | 4,000–6,000 bicycle stores |

Brand dealer locator data is cross-referenced with Google Places records to build the `shop_brands` junction table — the core differentiator that no competitor has.

---

## Rendering Strategy

| Page Type | Rendering | Reason |
|-----------|-----------|--------|
| Shop, city, state pages | SSG via `getStaticPaths()` | SEO-critical, infrequent data changes |
| Brand pages, bike model pages | SSG | SEO-critical |
| Homepage, brand dealer finder | SSR | Dynamic/personalized content |
| Guides, informational content | SSG | Static editorial |
| `/api/*` routes | SSR | Dynamic data endpoints |

Nightly rebuilds are triggered via Vercel Cron Jobs. Critical updates trigger on-demand revalidation via webhook to `/api/rebuild`.

---

## SEO Architecture

Every page type includes appropriate JSON-LD structured data:

- **Shop listings** — `BikeStore` (subtype of `LocalBusiness`)
- **Bike model pages** — `Product` with `AggregateOffer`
- **All directory pages** — `BreadcrumbList`
- **Guide pages** — `FAQPage` for rich snippet eligibility

### Target Keyword Clusters (by priority)

1. **Long-tail local** — "eBike shops in [city]" — 15K–35K monthly searches aggregate, virtually no competition
2. **Informational** — "eBike laws by state", "eBike tax credit 2026" — 8K–20K/mo, beatable competition
3. **Near me** — "electric bike shops near me" — 12K–22K/mo
4. **Brand intent** — "[Brand] dealers near [city]" — high purchase intent
5. **Product research** — "best electric bike under $X" — deprioritize until month 6+ (high competition)

---

## Revenue Model

| Stream | Timeline | Est. Monthly (Month 18) |
|--------|----------|------------------------|
| Affiliate commissions (AvantLink, ShareASale, Impact) | Month 1+ | $2,300–$15,000 |
| Display ads (Monumetric → Mediavine) | Month 6+ | $500–$2,250 |
| Verified Partner listings ($75–$150/month per shop) | Month 6+ | $1,125–$9,000 |

Top affiliate programs: EVELO (6%, $180–$330/sale), QuietKat (5%, $100–$262/sale), Velotric (7% + bonuses), Aventon (4%, $44–$100/sale).

---

## Supported eBike Brands

Aventon · Cannondale · EVELO · Gazelle · Giant · Himiway · Lectric · Pedego · QuietKat · Rad Power Bikes · Ride1UP · Specialized · Tern · Trek · Velotric

---

## Docs

- [`docs/blueprint.md`](docs/blueprint.md) — Full business research: market analysis, brand dealer data, competitive landscape, affiliate programs, SEO keyword map, revenue projections
- [`docs/SPEC.md`](docs/SPEC.md) — Technical specification: stack decisions, database schema, scraping architecture, SEO strategy, content plan
- [`docs/ACTION.md`](docs/ACTION.md) — Development action plan and task tracker
