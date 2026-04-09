# eBikeLocal.com — Implementation Action Plan

> Checkboxes track build progress. Check items as completed during development.

---

## Phase 1: Project Setup & Infrastructure (Week 1)

### Astro.js Project Initialization

- [ ] Initialize Astro.js 6.x project with TypeScript (`npm create astro@latest`)
- [ ] Install and configure Tailwind CSS 4.x integration (`npx astro add tailwind`)
- [ ] Install Vercel adapter (`npx astro add vercel`)
- [ ] Configure hybrid rendering in `astro.config.mjs` (SSG default + SSR for API routes and dynamic pages)
- [ ] Set up project directory structure:
  - [ ] `src/pages/` — route pages
  - [ ] `src/components/` — reusable UI components
  - [ ] `src/layouts/` — page layout templates
  - [ ] `src/lib/` — utilities, DB connection, helpers
  - [ ] `src/styles/` — global styles
  - [ ] `src/content/` — editorial content (guides, articles)
  - [ ] `scripts/` — scraping and data pipeline scripts
- [ ] Configure `.env` file with all required environment variables (see SPEC.md Section 2)
- [ ] Add `.env` to `.gitignore`
- [ ] Set up Pagefind for client-side search

### Neon DB Setup

- [ ] Create Neon project (Launch tier)
- [ ] Enable PostGIS extension (`CREATE EXTENSION IF NOT EXISTS postgis`)
- [ ] Enable pg_trgm extension (`CREATE EXTENSION IF NOT EXISTS pg_trgm`)
- [ ] Enable uuid-ossp extension (`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
- [ ] Create `shops` table with all columns per SPEC.md schema
- [ ] Create `brands` table
- [ ] Create `shop_brands` junction table
- [ ] Create `bikes` table
- [ ] Create `categories` table
- [ ] Create `bike_categories` junction table
- [ ] Create `states` table
- [ ] Create `cities` table
- [ ] Create `reviews` table
- [ ] Create all indexes per SPEC.md schema (spatial, text search, foreign keys)
- [ ] Set up `dev` branch for development
- [ ] Verify connection from Astro via `postgres.js` driver
- [ ] Install `postgres` npm package and create `src/lib/neon.ts` DB connection utility

### Vercel Setup

- [ ] Connect GitHub repo to Vercel
- [ ] Configure Neon integration (Vercel Marketplace or manual env vars)
- [ ] Set all environment variables in Vercel project settings
- [ ] Configure Vercel cron job for nightly rebuilds
- [ ] Verify preview deployments work with Neon dev branch
- [ ] Set up deploy hook URL for programmatic rebuild triggers

### Version Control & CI

- [ ] Initialize Git repository
- [ ] Create `.gitignore` (node_modules, .env, dist, .vercel)
- [ ] Set up initial commit with project skeleton
- [ ] Configure branch protection for `main`

---

## Phase 2: Core Layouts & Components (Week 2)

### Base Layout & Navigation

- [ ] Create `BaseLayout.astro` with HTML head (meta, OG tags, JSON-LD slot, Tailwind)
- [ ] Create responsive header/navigation component
- [ ] Create footer component with site links, legal pages
- [ ] Create breadcrumb component (with `BreadcrumbList` JSON-LD)
- [ ] Create mobile hamburger menu
- [ ] Set up global CSS/Tailwind theme tokens (colors, typography, spacing)

### Shared UI Components

- [ ] `ShopCard.astro` — shop listing card (name, address, rating, brands, services)
- [ ] `BikeCard.astro` — product card (image, name, price, specs, CTA button)
- [ ] `BrandBadge.astro` — small brand logo/name badge for shop listings
- [ ] `RatingStars.astro` — star rating display component
- [ ] `FilterBar.astro` — filterable chip/dropdown bar (brand, service, category)
- [ ] `MapEmbed.astro` — Google Maps embed for single shop
- [ ] `MultiPinMap.astro` — Leaflet.js multi-pin map for city/state pages
- [ ] `Pagination.astro` — page navigation for long shop lists
- [ ] `SearchBar.astro` — homepage/header search input with autocomplete
- [ ] `CTAButton.astro` — affiliate CTA button ("Check Price at [Brand]")
- [ ] `SpecRow.astro` — icon + value pair for bike specs display
- [ ] `AwardBadge.astro` — corner overlay badge ("Best Commuter", "Best Value")
- [ ] `ServiceTag.astro` — service indicator chips (Sales, Repair, Rental, Test Rides)

### SEO Components

- [ ] `JsonLd.astro` — generic JSON-LD injection component
- [ ] `BikeStoreSchema.astro` — `BikeStore` structured data for shop listings
- [ ] `ProductSchema.astro` — `Product` structured data for bike pages
- [ ] `FAQSchema.astro` — `FAQPage` structured data for guide pages
- [ ] `BreadcrumbSchema.astro` — `BreadcrumbList` structured data
- [ ] `MetaTags.astro` — OpenGraph + Twitter Card meta tags
- [ ] Dynamic `<title>` and `<meta description>` generation per page type
- [ ] Canonical URL configuration
- [ ] XML sitemap generation (split by page type for large sitemaps)

---

## Phase 3: Page Templates (Week 2–3)

### Homepage (`/`)

- [ ] Hero section with search bar (city/zip search)
- [ ] "How it works" brief explainer section
- [ ] Featured/popular cities grid
- [ ] Featured brands row
- [ ] Latest guides/articles section
- [ ] Stats bar (total shops, brands, cities covered)
- [ ] SSR rendering for personalized content

### Shop Directory Pages

- [ ] `/shops/` — national hub page (SSG)
  - [ ] State grid/list with shop counts
  - [ ] National stats summary
- [ ] `/shops/[state-slug]/` — state page (SSG via `getStaticPaths`)
  - [ ] State map with city markers (Leaflet)
  - [ ] City list with shop counts
  - [ ] State eBike law summary
  - [ ] Rebate/incentive programs section
  - [ ] Top brands in state (aggregated from `shop_brands`)
- [ ] `/shops/[state-slug]/[city-slug]/` — city page (SSG via `getStaticPaths`)
  - [ ] City map with all shop pins (Leaflet)
  - [ ] Filterable shop list (by brand, service, rating)
  - [ ] "Brands available in [City]" section
  - [ ] State law summary callout with link
  - [ ] Nearby cities section
  - [ ] Shop count and services summary
- [ ] `/shops/[state-slug]/[city-slug]/[shop-slug]/` — shop listing page (SSG)
  - [ ] Shop name, address, phone, website, hours
  - [ ] Google Maps embed
  - [ ] Brands carried section (from `shop_brands`) with affiliate CTAs
  - [ ] Services offered tags
  - [ ] Google rating display
  - [ ] Native reviews section
  - [ ] Photo gallery
  - [ ] "Nearby eBike Shops" section
  - [ ] `BikeStore` JSON-LD structured data

### Brand Pages

- [ ] `/brands/` — brand directory hub (SSG)
  - [ ] All brands grid with logos, price ranges, dealer counts
- [ ] `/brands/[brand-slug]/` — brand page (SSG via `getStaticPaths`)
  - [ ] Brand header with logo and overview
  - [ ] Quick stats bar (models, price range, avg rating, categories)
  - [ ] "Best Of" picks (top 3 product cards)
  - [ ] All models grid (filterable/sortable)
  - [ ] Brand info (warranty, support, where to buy)
  - [ ] Cross-links to city pages where brand has dealers
  - [ ] Affiliate CTA ("Shop [Brand] Online")
- [ ] `/brands/[brand-slug]/dealers/` — brand dealer finder (SSR)
  - [ ] Search by city/zip
  - [ ] Map with dealer locations
  - [ ] Dealer list with distance

### Bike/Product Pages

- [ ] `/bikes/` — product catalog hub (SSG)
  - [ ] Featured/popular bikes grid
  - [ ] Filter by category, brand, price range
- [ ] `/bikes/[brand-slug]/[model-slug]/` — model page (SSG via `getStaticPaths`)
  - [ ] Hero image
  - [ ] Price with affiliate CTA buttons (multiple retailers)
  - [ ] Full spec table
  - [ ] Pros/cons list
  - [ ] Expert rating and "Best For" tag
  - [ ] "Find a Dealer" section (shops carrying this brand)
  - [ ] Related models
  - [ ] `Product` JSON-LD structured data

### Category Pages

- [ ] `/categories/` — category hub (SSG)
- [ ] `/categories/[category-slug]/` — category page (SSG via `getStaticPaths`)
  - [ ] Category description and icon
  - [ ] Top picks product cards
  - [ ] All bikes in category (filterable grid)
  - [ ] Comparison table

### Guide & Content Pages

- [ ] `/guides/` — content hub (SSG)
- [ ] `/guides/[topic-slug]/` — individual guide (SSG from content collection)
- [ ] `/guides/ebike-laws/[state-slug]/` — state law page (SSG via `getStaticPaths`)
  - [ ] State-specific eBike class rules
  - [ ] Helmet requirements, age limits, registration
  - [ ] Trail/path access rules
  - [ ] Rebate programs
  - [ ] `FAQPage` JSON-LD
- [ ] `/best/` — buying guide hub (SSG)
- [ ] `/best/[topic-slug]/` — buying guide page (SSG)
  - [ ] Product comparison table
  - [ ] Individual product cards with affiliate CTAs
  - [ ] Methodology section

### API Routes

- [ ] `/api/search` — shop search by city/zip/coordinates (SSR)
- [ ] `/api/suggest` — autocomplete for city/shop names (SSR)
- [ ] `/api/rebuild` — webhook endpoint to trigger Vercel rebuild (SSR, authenticated)

---

## Phase 4: Data Pipeline — Brand Scraping (Week 3–4)

### Scraper Infrastructure

- [ ] Set up `scripts/` directory with shared utilities
- [ ] Create scraper base class/module with rate limiting (1 req/sec per domain)
- [ ] Create raw data staging table in Neon for unprocessed scraper output
- [ ] Set up error logging and retry logic for failed scrapes
- [ ] Respect `robots.txt` — build checker utility

### Tier 1: Shopify-Based Brand Scrapers (Playwright)

- [ ] **Aventon** scraper (`aventon.com/pages/electric-bike-shop-dealer-locator`)
  - [ ] Launch Playwright, intercept XHR for JSON dealer data
  - [ ] Extract: name, address, city, state, zip, coordinates, test ride badge
  - [ ] Store raw results in staging table
- [ ] **Lectric eBikes** scraper (Stockist API)
  - [ ] Query `app.stockist.co/api/v1/{tag}/locations/search` with lat/lng grid
  - [ ] Extract: name, address, phone, email, website, category tags
  - [ ] Store raw results
- [ ] **Rad Power Bikes** scraper (`radpowerbikes.com/pages/locations`)
  - [ ] Verify site is still operational (post Life EV acquisition)
  - [ ] Extract RadRetail stores + service partner locations
  - [ ] Flag as uncertain source
- [ ] **Velotric** scraper (`velotricbike.com/pages/find-a-dealer`)
  - [ ] Extract dealer list + Showcase Store designations
  - [ ] Note model-specific availability if present
- [ ] **Pedego** scraper (`dealers.pedegoelectricbikes.com`)
  - [ ] Crawl franchise store sitemap
  - [ ] Extract rich data: products, rentals, local content

### Tier 2: Enterprise Platform Scrapers (Playwright)

- [ ] **Trek** scraper (`trekbikes.com/us/en_US/store-finder/`)
  - [ ] Intercept Vue.js SPA internal REST API calls
  - [ ] Capture JSON dealer data from API responses
- [ ] **Specialized** scraper (`specialized.com/us/en/store-finder`)
  - [ ] Playwright with Amplience CMS content
  - [ ] Extract store features filter data
- [ ] **Giant** scraper (`giant-bicycles.com/us/stores`)
  - [ ] Extract capability badges (E-Bike Service, Fitting, Rentals, etc.)
  - [ ] Capture all ~1,224 US locations

### Tier 3: Third-Party Platform Scrapers (API/HTTP)

- [ ] **Cannondale** via Locally.com API
  - [ ] Query `api.locally.com/stores/search` with brand filter
  - [ ] Extract: store info + real-time inventory/pricing data
- [ ] **Gazelle** via Locally.com API + Magento fallback
- [ ] **BULLS Bikes** via Beeline Connect
  - [ ] Identify Beeline API endpoints from network requests
  - [ ] Extract dealer data from Beeline's Dynamic Dealer Locator
- [ ] **Priority Bicycles** via Beeline Connect (same pattern as BULLS)
- [ ] **Tern** scraper (`ternbicycles.com/us/dealers/map`)
  - [ ] Cheerio (server-rendered Drupal)
  - [ ] Extract dealer pages at `/us/dealers/{id}`
  - [ ] Capture "Preferred Dealer" badges
- [ ] **Riese & Muller** scraper (`r-m.de/en-us/dealer-search/`)
  - [ ] Intercept Google Maps API marker data
  - [ ] Capture dealer tier: Regular, Experience Store, Cargo Hub

---

## Phase 5: Data Pipeline — Google Places API (Week 4–5)

### Discovery Phase

- [ ] Build Google Places Text Search script
  - [ ] Configure query variants: "electric bike shop", "ebike dealer", "e-bike store", "electric bicycle shop"
  - [ ] Set `includedType: "bicycle_store"`
  - [ ] Implement pagination handling
- [ ] Generate search grid:
  - [ ] ~400 US metro area coordinates
  - [ ] ~2,500 rural grid points
  - [ ] 50 state-level broad queries
- [ ] Execute discovery sweep (~11,300 requests)
- [ ] Deduplicate on `google_place_id`
- [ ] Store raw discovery results

### Enrichment Phase

- [ ] Build Place Details enrichment script (Enterprise tier fields)
  - [ ] Fetch: phone, website, hours, rating, review count, business status
- [ ] Execute enrichment for all discovered shops (~5,000 requests)
- [ ] Fetch 1 primary photo per shop (~5,000 requests)
- [ ] Store enriched data in staging table

### Supplementary Sources

- [ ] OpenStreetMap Overpass API query for US bicycle shops (`shop=bicycle`)
- [ ] Cross-reference OSM data with Google Places results
- [ ] Foursquare Places API query for bicycle stores (free tier)
- [ ] Merge supplementary data into staging table

---

## Phase 6: Data Processing & Classification (Week 5–6)

### Deduplication Engine

- [ ] Build address normalization function (strip suite numbers, standardize abbreviations)
- [ ] Build fuzzy name matching using `pg_trgm` similarity (threshold 0.6)
- [ ] Build coordinate proximity check (<50m)
- [ ] Match brand dealer data against Google Places data
- [ ] Merge duplicates — prefer Google Places as canonical, enrich with brand data
- [ ] Generate deduplication report with confidence scores

### eBike Classification Pipeline

- [ ] Implement text query signal scoring (base 0.3 for eBike-specific query results)
- [ ] Implement Google review text analysis for eBike brand mentions (+0.2)
- [ ] Implement shop website scraping for eBike keywords (+0.2)
- [ ] Implement brand dealer cross-reference scoring (+0.3, auto-confirms)
- [ ] Implement Google summary field analysis (+0.1)
- [ ] Calculate `ebike_confidence_score` for all shops
- [ ] Set `is_ebike_specialist = true` for score >= 0.8
- [ ] Filter: include only shops with score >= 0.5

### Shop-Brand Junction Population

- [ ] Cross-reference each brand's dealer list against unified shop records
- [ ] Populate `shop_brands` table with source and verification data
- [ ] Generate "brands carried" counts per shop
- [ ] Generate "shops carrying [brand]" counts per brand
- [ ] Identify shops carrying 3+ brands (likely eBike specialists)

### Geographic Data Population

- [ ] Populate `states` table (50 states + DC)
- [ ] Research and populate state eBike law fields for all states
- [ ] Populate `cities` table from shop data (unique city/state combinations)
- [ ] Calculate and store `shop_count` for each city and state
- [ ] Set `has_dedicated_page = true` for cities with 2+ shops
- [ ] Generate city slugs (lowercase, hyphenated)

### Brand & Product Data Population

- [ ] Seed `brands` table with 15 initial brands and all metadata
  - [ ] Name, slug, logo, website, description
  - [ ] Affiliate program details (platform, commission rate, cookie duration)
  - [ ] Dealer locator URL, estimated US dealers
- [ ] Seed `categories` table with 10 primary eBike categories
- [ ] Begin populating `bikes` table with top models per brand (MVP: 5–10 per brand)
  - [ ] Model name, slug, MSRP, category, class
  - [ ] Motor specs, battery specs, range, weight
  - [ ] Hero image, affiliate URL, buy URLs

---

## Phase 7: Content Creation (Week 6–7)

### Editorial Guides

- [ ] Write "eBike Tax Credit 2026" comprehensive guide
- [ ] Write "eBike Laws by State" hub page intro
- [ ] Write "eBike Classes Explained (Class 1 vs 2 vs 3)" guide
- [ ] Write "How to Choose an eBike" buying guide
- [ ] Write "What to Look for in an eBike Shop" guide
- [ ] Populate state-specific law data for all 50 states (programmatic from `states` table)
- [ ] Write 5 "Best eBikes Under $X" buying guides (under $1000, $1500, $2000, $2500, $3000)
- [ ] Write brand overview descriptions for all 15 brands

### Templated Content (Unique Per Page)

- [ ] Write city page template that dynamically populates unique content:
  - [ ] Shop count, brand availability, services summary
  - [ ] Local context (state law callout, nearby cities)
- [ ] Write state page template with unique data aggregations
- [ ] Write shop listing description guidance (avoid auto-generated duplicate content)
- [ ] Ensure NO page uses identical templated paragraph text (anti-electricbikeshops.com)

---

## Phase 8: Affiliate Integration (Week 7)

### AvantLink Integration

- [ ] Apply to AvantLink as affiliate
- [ ] Get API Authorization Key
- [ ] Build affiliate link generator utility (`src/lib/affiliate.ts`)
- [ ] Apply to individual merchant programs:
  - [ ] Aventon
  - [ ] Lectric eBikes
  - [ ] Electric Bike Company
  - [ ] EVELO
  - [ ] QuietKat
  - [ ] Blix Bikes
  - [ ] Rad Power Bikes (verify availability)
  - [ ] REI (Co-op Cycles)
- [ ] Generate and store affiliate links for each brand

### ShareASale Integration

- [ ] Apply to ShareASale as affiliate
- [ ] Apply to merchant programs:
  - [ ] Himiway
  - [ ] Engwe
  - [ ] Heybike
- [ ] Generate affiliate links

### Impact Integration

- [ ] Apply to Impact as affiliate
- [ ] Apply to Velotric merchant program
- [ ] Generate affiliate links

### Other Programs

- [ ] Apply to Ride1UP direct program (Tune platform)
- [ ] Apply to CJ Affiliate for Super73 and Tenways
- [ ] Apply to Buzz Bicycles direct program
- [ ] Set up Amazon Associates account for budget brand fallback links

### Affiliate Link Implementation

- [ ] Build `CTAButton` component with proper affiliate link insertion
- [ ] Add affiliate disclosure on all pages with affiliate links
- [ ] Add `/disclosure` page with full FTC-compliant affiliate disclosure
- [ ] Implement `nofollow` on all affiliate links
- [ ] Test all affiliate links for proper tracking

---

## Phase 9: Testing & QA (Week 7–8)

### Functional Testing

- [ ] Verify all `getStaticPaths` routes generate correctly
- [ ] Test shop listing pages render with correct data
- [ ] Test city pages aggregate correct shops and brands
- [ ] Test state pages show correct city counts and law data
- [ ] Test brand pages display correct models and dealer counts
- [ ] Test bike model pages show correct specs and affiliate CTAs
- [ ] Test API routes (`/api/search`, `/api/suggest`) return correct results
- [ ] Test search functionality (Pagefind) indexes all pages

### SEO Verification

- [ ] Validate JSON-LD structured data on all page types (Google Rich Results Test)
- [ ] Verify `<title>` and `<meta description>` are unique per page
- [ ] Verify canonical URLs are correct
- [ ] Verify XML sitemap generates correctly and includes all pages
- [ ] Verify `robots.txt` allows crawling of all public pages
- [ ] Verify breadcrumb markup on all directory pages
- [ ] Test OpenGraph tags render correct previews (Facebook Sharing Debugger)
- [ ] Verify no duplicate content across pages (spot check 20+ pages)

### Performance Testing

- [ ] Lighthouse audit on all page types — target 90+ performance score
- [ ] Verify Astro outputs minimal JavaScript (islands architecture)
- [ ] Test page load times on mobile (target < 2s LCP)
- [ ] Verify images are optimized (WebP/AVIF, lazy loading, proper sizing)
- [ ] Verify Leaflet.js maps load performantly with many pins

### Responsive / Accessibility

- [ ] Test all pages on mobile (375px), tablet (768px), desktop (1280px)
- [ ] Verify touch targets are 44px+ on mobile
- [ ] Run axe accessibility audit — fix all critical/serious issues
- [ ] Verify proper heading hierarchy (H1 > H2 > H3) on all pages
- [ ] Test keyboard navigation for filters and search
- [ ] Verify color contrast meets WCAG AA

### Data Integrity

- [ ] Verify shop counts match between city pages and actual database records
- [ ] Verify brand counts on shop listings match `shop_brands` table
- [ ] Spot check 50 shop listings against original Google Places / brand data
- [ ] Verify no shops with `google_business_status = 'CLOSED_PERMANENTLY'` are shown
- [ ] Verify all affiliate links point to correct merchants

---

## Phase 10: Launch & Post-Launch (Week 8)

### Pre-Launch Checklist

- [ ] Final review of all environment variables in Vercel production
- [ ] Verify Neon `main` branch has complete production data
- [ ] Full production build succeeds locally
- [ ] All pages generate without errors
- [ ] SSL certificate active on custom domain
- [ ] Custom 404 page created
- [ ] Privacy policy page created
- [ ] Terms of service page created
- [ ] Affiliate disclosure page created
- [ ] Favicon and PWA manifest configured
- [ ] Social sharing images (OG images) generated for key pages

### Deploy to Production

- [ ] Deploy to Vercel production
- [ ] Verify custom domain (ebikelocal.com) points to Vercel
- [ ] Verify all pages are accessible and rendering correctly
- [ ] Verify Vercel cron job fires nightly rebuild
- [ ] Smoke test 10 random pages across all types

### Post-Launch SEO Submission

- [ ] Submit sitemap to Google Search Console
- [ ] Submit sitemap to Bing Webmaster Tools
- [ ] Request indexing of priority pages (homepage, top city pages, guides)
- [ ] Set up Google Search Console alerts for crawl errors
- [ ] Verify structured data appears in Search Console enhancement reports

### Analytics & Monitoring

- [ ] Verify Plausible/Umami analytics tracking on all pages
- [ ] Set up uptime monitoring (e.g., Better Uptime, UptimeRobot)
- [ ] Set up scraper health monitoring (alert on consecutive failures)
- [ ] Monitor Google Search Console for indexing progress
- [ ] Track affiliate conversion data per platform

---

## Phase 11: Post-Launch Growth (Month 2+)

### Content Expansion

- [ ] Expand city pages to 500+ cities (all cities with 2+ shops)
- [ ] Write 10 additional informational articles
- [ ] Create category landing pages for all 10 eBike categories
- [ ] Begin model-specific review content (5 reviews/month)
- [ ] Write "Best eBikes for [use case]" guides (commuting, seniors, heavy riders, etc.)

### Data Enrichment

- [ ] Run monthly Google Places refresh for all shops
- [ ] Re-scrape brand dealer locators monthly for updated data
- [ ] Identify and add new eBike brands and dealers
- [ ] Enrich shop descriptions with unique editorial content (prioritize top-traffic shops)
- [ ] Add "Claimed" and "Verified" badges for shops that respond to outreach

### Feature Additions

- [ ] Build "Claim Your Listing" flow for shop owners
- [ ] Build native review submission form
- [ ] Build email newsletter for eBike news and deals
- [ ] Implement comparison tool (side-by-side bike specs)
- [ ] Add "Saved Shops" functionality (localStorage or account-based)
- [ ] Build "Verified Partner" dashboard for paying shop partners

### Revenue Optimization

- [ ] Apply for Monumetric display ads (requires 10K sessions/month)
- [ ] Begin outreach to shops for Verified Partner upsell ($75–$150/month)
- [ ] Optimize affiliate CTAs based on click-through data
- [ ] A/B test product card layouts for conversion rate
- [ ] Apply for Mediavine when traffic reaches 50K sessions/month

### Link Building & Marketing

- [ ] Submit to relevant web directories
- [ ] Reach out to local cycling blogs for backlinks
- [ ] Create shareable infographics (eBike laws by state map, etc.)
- [ ] Engage in eBike community forums (Reddit r/ebikes, etc.)
- [ ] Social media presence (focus on visual platforms — Instagram, Pinterest)
