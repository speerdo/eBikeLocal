# eBikeLocal — Cursor Action Items

> Derived from site review of https://e-bike-local.vercel.app/
> Work through these in priority order. Each item includes context, exact location, and what done looks like.

## Progress Tracker

- [x] 1.1 Fix duplicate shop listings from Google Places data pipeline
- [x] 1.2 Audit and remove non-bike-shop listings from dataset
- [x] 1.3 Fix duplicate bike entries on brand pages
- [x] 1.4 Add Rad Power Bikes status indicator on shop brand badges
- [x] 2.1 Fix or replace the non-functional homepage search bar
- [x] 2.2 Fix homepage map claim vs. reality
- [x] 2.3 Expand homepage Popular Cities grid
- [x] 3.1 Fix grammar error on bike detail pages
- [x] 3.2 Add editorial content to the `/best/` index page
- [x] 3.3 Add depth to individual `/best/` buying guide pages
- [x] 3.4 Reduce duplicate content risk on individual shop pages
- [x] 4.1 Move affiliate disclosure above the fold on revenue-generating pages
- [x] 4.2 Create an About page
- [x] 5.1 Audit `/bikes/` index page
- [x] 5.2 Verify search/filter functionality on city pages
- [x] 5.3 Confirm structured data (Schema.org) is implemented
- [x] 5.4 Verify canonical tags on paginated or param-based pages

---

## Priority 1 — Critical Fixes (Data Integrity & Trust)

### 1.1 Fix duplicate shop listings from Google Places data pipeline

**Problem:** The same business appears multiple times with slightly different names/addresses. Confirmed example in Austin: "The Meteor Bike Shop Austin" (2114 S Congress Ave) and "The Meteor, Llc" (2114 1/2 S. Congress Ave) are the same shop.

**Fix:**

- In the data pipeline / seeding script, add a deduplication step that normalizes addresses before insert
- Normalize address strings: strip unit suffixes (`1/2`, `Suite`, `Ste`, `#`, `Unit`) and compare base street number + street name
- If two shops share the same normalized address AND the same city/state, flag as duplicate and keep only the one with more reviews (higher `user_ratings_total`)
- Add a `UNIQUE` constraint or dedup check on `(normalized_address, city, state)` in the DB to prevent future re-introduction

**Files likely involved:** data pipeline script, DB seed/import logic, possibly a `shops` or `listings` table migration

---

### 1.2 Audit and remove non-bike-shop listings from dataset

**Problem:** "Ristretto" appears in Austin with 2.3 stars and 18 reviews — almost certainly a coffee shop pulled in erroneously from the Google Places API.

**Fix:**

- Add a post-import validation filter that flags shops with:
  - Fewer than 20 Google reviews AND rating below 3.5
  - Business name containing known false-positive terms: `coffee`, `cafe`, `restaurant`, `bar`, `hotel`, `inn`, `lodge` (unless also contains `bike` or `cycle` or `ebike`)
- Move flagged records to a `pending_review` status rather than deleting — surface them in an admin view for manual confirmation
- Run the filter against the existing dataset and remove or re-status confirmed non-shops

---

### 1.3 Fix duplicate bike entries on brand pages

**Problem:** On `/brands/aventon/`, several bikes appear in both the "Popular Aventon eBikes" section and the "Aventon models in our catalog" section. Confirmed duplicates: Soltera.2, Aventure 2, Level 2.

**Fix:**

- In the brand page template, when rendering "Popular eBikes" (the curated featured section), collect the slugs/IDs of bikes already rendered
- When rendering the full catalog grid below, exclude any bike whose slug is already in the featured set
- Pseudocode: `catalogBikes = allBikes.filter(b => !featuredBikes.map(f => f.slug).includes(b.slug))`

**Files likely involved:** `/src/pages/brands/[brand].astro` or equivalent brand page template

---

### 1.4 Add Rad Power Bikes status indicator on shop brand badges

**Problem:** Rad Power Bikes filed Chapter 11 in December 2025 and was acquired by Life EV. Shops listing Rad as a carried brand may have since dropped it, but the badge shows with no caveat.

**Fix:**

- Add an optional `status` or `note` field to the brand badge component
- For Rad Power Bikes specifically, render the badge with a `⚠️` indicator and tooltip/title text: `"Dealer status may have changed — Rad Power Bikes filed Chapter 11 in Dec 2025"`
- On the `/brands/rad-power-bikes/` page, add a prominent banner at the top of the page (above the bike listings) with the current status note — similar to what's already in the brand description text but more visually prominent

**Files likely involved:** brand badge component, `/src/pages/brands/rad-power-bikes.astro` or equivalent

---

## Priority 2 — Homepage & Navigation UX

### 2.1 Fix or replace the non-functional homepage search bar

**Problem:** The hero section has a prominent search input with placeholder "Try: Austin TX · Denver, CO · 98101" but it does not appear to route anywhere. This is the primary CTA on the homepage and a dead end creates immediate distrust.

**Option A — Make it functional (preferred):**

- Wire the search input to route on submit to `/shops/[state]/[city-slug]/` by matching the input against city/state data
- On submit, normalize the input: trim whitespace, handle "Austin TX", "Austin, TX", "Austin, Texas", zip code formats
- If a match is found, redirect to the city page
- If no match, redirect to `/shops/` with the query as a filter param, or show an inline "No exact match — browse by state" fallback

**Option B — Replace with Browse CTA:**

- If search routing is out of scope now, remove the text input entirely
- Replace with a two-button CTA: "Browse by State →" and "View All Brands →"
- Remove the "Try: Austin TX..." helper text

**Files likely involved:** homepage hero component, possibly a new `search.ts` utility for city name normalization

---

### 2.2 Fix homepage map claim vs. reality

**Problem:** The homepage copy under step 01 of "Find your local eBike dealer in 3 steps" reads: _"Enter your city or zip code to instantly see all eBike shops nearby on an interactive map."_ City pages currently show a flat list, not a map.

**Fix (if map is not yet built):**

- Change copy to: _"Enter your city or zip code to see all eBike shops in your area — with addresses, ratings, and brand data."_
- Remove the word "map" from this section until the map feature is live

**Fix (if map is planned soon):**

- Leave the copy but add `<!-- TODO: map feature -->` comment in template as a reminder
- Add a map placeholder card on city pages with "Interactive map coming soon" so the page doesn't feel incomplete

---

### 2.3 Expand homepage Popular Cities grid

**Problem:** The 12 cities shown skew heavily coastal/major metro (Brooklyn, Chicago, NYC, LA, SF, San Diego). This undersells national coverage and misses strong eBike markets.

**Fix:**

- Expand the grid to 16–20 cities
- Add at minimum: Denver CO, Portland OR, Seattle WA, Austin TX, Nashville TN, Boulder CO, Tucson AZ, Minneapolis MN
- Sort the grid by a combination of shop count + city SEO value rather than just shop count
- Consider labeling the section "Popular eBike Cities" instead of "Popular Cities" for keyword signal

---

## Priority 3 — Content & SEO Depth

### 3.1 Fix grammar error on bike detail pages

**Problem:** "Find a Aventon Dealer" — should be "Find an Aventon Dealer." This appears on every Aventon bike spec page.

**Fix:**

- In the bike detail page template, use a helper function to determine the correct article ("a" vs "an") based on whether the brand name starts with a vowel sound
- Simple implementation: `const article = /^[aeiou]/i.test(brandName) ? 'an' : 'a'`
- Apply to the "Find a/an [Brand] Dealer" heading on all bike spec pages

**Files likely involved:** `/src/pages/bikes/[brand]/[bike].astro` or equivalent bike detail template

---

### 3.2 Add editorial content to the `/best/` index page

**Problem:** `/best/` has only an H1 and 10 card links. No editorial copy, no methodology explanation, nothing for Google to evaluate beyond the link list.

**Fix:**

- Add a 150–250 word intro section between the H1 and the card grid explaining:
  - How bikes are selected (specs evaluated, price-to-value analysis, etc.)
  - When the guides were last updated
  - A brief note on the range of categories covered
- Add a short meta description if not already present: something like "Expert eBike buying guides by price range and riding style, updated for 2026. Find the best electric bike for commuting, cargo, trail riding, and more."

**Files likely involved:** `/src/pages/best/index.astro` or equivalent

---

### 3.3 Add depth to individual `/best/` buying guide pages

**Problem:** The buying guide pages (e.g., `/best/best-ebikes-under-1000/`) are high search volume targets but are likely stub pages currently.

**Fix for each buying guide page:**

- Minimum 600 words of editorial content
- Include: top 3–5 recommended bikes with pros/cons, a comparison table (model, price, range, motor, class), and a "who this is for" framing section
- Link each recommended bike to its `/bikes/[brand]/[slug]/` detail page
- Link to the nearest `/brands/[brand]/` page for each featured brand
- Add `updated: [date]` frontmatter and display it visibly on the page ("Last updated April 2026")
- These pages are the primary affiliate revenue driver — each "Check Price" link should have the affiliate param attached

---

### 3.4 Reduce duplicate content risk on individual shop pages

**Problem:** The auto-generated shop description ("Bicycle House serves cyclists in Austin, TX, with bikes, accessories, and in-store support. Carried brands include Giant. Contact the store for current inventory...") is structurally identical across all 8,000+ shop pages. This is a significant thin/duplicate content risk at scale.

**Fix:**

- Vary the boilerplate template using the shop's available data fields:
  - If has brands: _"[Name] is an authorized [Brand1] and [Brand2] dealer in [City], [State]..."_
  - If has high rating: _"One of [City]'s top-rated bike shops with a [X.X] star rating across [N] reviews..."_
  - If has long hours: _"Open 6 days a week, [Name] offers..."_
  - If brands array is empty: _"[Name] is a local bike shop in [City], [State] offering sales, service, and accessories."_
- Create 4–6 template variants and assign them based on available data fields to ensure no two shop pages share the exact same generated sentence
- Add a structured `description_generated: true` flag in the DB so human-written descriptions can override the template when a shop claims their listing

**Files likely involved:** shop detail page template, possibly a `generateShopDescription()` utility function

---

## Priority 4 — Legal & Compliance

### 4.1 Move affiliate disclosure above the fold on revenue-generating pages

**Problem:** The affiliate disclosure ("We earn commissions from some links — this doesn't affect our editorial independence") only appears in the footer. The FTC requires affiliate disclosures to be clear and conspicuous — meaning visible before the user encounters the affiliate links, not after scrolling past all content to the footer.

**Affected page types:**

- All `/brands/[brand]/` pages (contain "Check Price at [Brand]" links)
- All `/bikes/[brand]/[bike]/` pages (contain "Check Price" CTA)
- All `/best/[guide]/` pages (contain affiliate product links)

**Fix:**

- Add a small, styled disclosure bar near the top of the page content (not in the hero, but before the first affiliate link) on all three page types
- Suggested copy: _"Some links on this page are affiliate links — we may earn a commission if you buy, at no extra cost to you."_
- The disclosure on the guides pages (e.g., laws guide) already handles this correctly — replicate that pattern on the commercial pages

**Files likely involved:** brand page template, bike detail template, best picks templates

---

### 4.2 Create an About page

**Problem:** The footer tagline "Made for eBike riders, by eBike riders" creates an expectation of a human story behind the site, but there's no About page. This also matters for E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) — a key Google quality signal for review/recommendation content.

**Fix:**

- Create `/about/` page
- Content should include:
  - Brief origin story of the site (1–2 paragraphs)
  - What makes the data unique (brand-level dealer aggregation from 15+ brand locators)
  - Editorial standards: how bikes are evaluated, how shop data is verified
  - Link to `/disclosure/` for the full affiliate disclosure
- Link to `/about/` from the footer under the "Company" section (alongside Privacy, Terms, Disclosure)

---

## Priority 5 — To Audit / Investigate

### 5.1 Audit `/bikes/` index page

Not reviewed in this pass. Check if it has the same thin-content problem as `/best/` — if it's just a grid of bike cards with no editorial content, apply the same fix as item 3.2.

### 5.2 Verify search/filter functionality on city pages

City pages currently show a flat list sorted by rating. Confirm whether any client-side filter by brand is functional. If not yet built, add a "Filter by brand" UI using the "Brands Available in [City]" data already rendered at the top of the page — these chips should be clickable to filter the shop list.

### 5.3 Confirm structured data (Schema.org) is implemented

Check that the following schema types are present in page `<head>` or as JSON-LD:

- `LocalBusiness` on shop detail pages
- `BreadcrumbList` on all pages (breadcrumbs are visible — confirm they're also in structured data)
- `Article` or `HowTo` on guide pages
- `ItemList` on city pages and brand pages

If any are missing, add them. These are low-effort, high-SEO-value additions.

### 5.4 Verify canonical tags on paginated or param-based pages

If any pages are accessible via multiple URLs (e.g., with/without trailing slash, with query params from filtering), confirm canonical tags point to the clean URL to prevent duplicate indexing.

---

## Notes for Cursor

- Treat Priority 1 items as blocking — they affect data integrity and should be done before any new content work
- Items 1.1 and 1.2 require changes to the data pipeline/import script, not just the frontend
- Item 2.1 Option A (functional search) is a larger feature — if it will take more than a few hours, ship Option B first and build Option A as a separate task
- For all template changes, check both the `.astro` page file and any shared layout/component files — some of these fixes may live in a shared component used across multiple page types
