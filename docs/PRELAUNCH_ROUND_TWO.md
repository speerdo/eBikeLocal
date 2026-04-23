# eBikeLocal — Pre-Launch Action Items (Round 2)

> SEO-focused review. Work through Priority 1 before launch, Priority 2 within first 2 weeks post-launch, Priority 3 ongoing.

---

## Priority 1 — Fix Before Launch

### 1.1 Homepage H1 is wrong — change it immediately

**Problem:** The current H1 is `"Find the Best eBike Local Near You"`. This is the single most important on-page SEO element on the site and it's wasting it on a branded phrase nobody searches. "eBike Local" is not a search query.

**Fix:**

- Change H1 to: `"Find eBike Shops Near You"`
- Or: `"Local eBike Dealers — Find Shops, Compare Brands"`
- The pre-header eyebrow text ("The only directory with brand-level dealer data") is fine where it is as supporting copy, it just shouldn't be the H1

**Why it matters:** Google uses the H1 as a primary signal for what the page is about. "Find eBike Shops Near You" matches how users actually search. This is a one-line change with outsized SEO impact.

---

### 1.2 State pages have no meta descriptions and thin H1s

**Problem:** The California state page H1 is `"eBike Shops in California"` — acceptable but minimal. More critically, there is no editorial paragraph above the city list. The page goes straight from H1 to "Most Active States" and then a wall of 200+ city links. Google sees a heading and a list of links — very little content signal.

**Fix:**

- Add a 3–5 sentence editorial paragraph after the H1 on every state page, unique per state. Example for California:
  > _"California has more eBike shops than any other state — 1,275 dealers across 212 cities. The state is a national leader in eBike adoption, with progressive regulations that allow Class 1 and 2 bikes on most multi-use paths. Major hubs include Los Angeles, San Francisco, San Diego, and a dense coastal corridor stretching through Huntington Beach, Santa Cruz, and Santa Barbara. California also offers some of the most generous state rebate programs in the country, with up to $2,000 available through the Clean Vehicle Rebate Project."_
- Add a unique `<meta description>` per state page. Template: `"Find [N] eBike shops across [State] — browse by city, filter by brand, and discover local dealers carrying Aventon, Trek, Specialized, and more."`
- This content can be templated with state-specific data fields (shop count, city count, top brands) — it does not need to be fully hand-written for every state

**Files likely involved:** `/src/pages/shops/[state].astro` or equivalent state page template

---

### 1.3 City pages have no introductory content — thin page risk at scale

**Problem:** The San Francisco city page H1 is `"eBike Shops in San Francisco, CA"` and immediately drops into brand filter chips and the shop list. 37 shops is a solid list, but Google's helpful content evaluation looks at whether the page provides value beyond just a list. With 1,500+ city pages at this structure, a large portion of the site is thin-content list pages.

**Fix:**

- Add a 2–3 sentence intro paragraph per city page, generated from available data. Minimum viable template:
  > _"[City] has [N] electric bike shops carrying brands including [Brand1], [Brand2], and [Brand3]. [City] riders benefit from [state law summary one-liner]. Browse the full list below or filter by brand to find a dealer near you."_
- For high-priority cities (top 50 by shop count), write manually crafted 4–5 sentence intros that include neighborhood context, notable shops, or cycling culture references
- Add unique `<meta description>` per city page: `"[N] eBike shops in [City], [State] — find local dealers carrying [top brands]. Ratings, hours, addresses, and brand data in one place."`

**Files likely involved:** `/src/pages/shops/[state]/[city].astro`

---

### 1.4 Individual shop pages are missing `LocalBusiness` structured data (Schema.org)

**Problem:** Shop pages have all the ingredients for rich structured data — name, address, phone, hours, rating, review count — but there's no indication any Schema.org JSON-LD is being output. Without `LocalBusiness` schema, these pages cannot earn rich results in Google (star ratings, hours in SERPs, etc.). This affects 8,000+ pages.

**Fix:**

- Add `LocalBusiness` JSON-LD to every shop detail page. Minimum required fields:

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "The New Wheel Electric Bikes",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1031 Valencia St",
    "addressLocality": "San Francisco",
    "addressRegion": "CA",
    "postalCode": "94110",
    "addressCountry": "US"
  },
  "telephone": "+14155247362",
  "url": "https://newwheel.net/",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.9",
    "reviewCount": "177"
  },
  "openingHoursSpecification": [ ... ],
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 37.7564109,
    "longitude": -122.4207403
  }
}
```

- Populate `openingHoursSpecification` from the hours data already being rendered on the page
- Also consider `"@type": ["LocalBusiness", "BikeStore"]` — `BikeStore` is a valid Schema.org subtype and more specific

**Files likely involved:** shop detail page template (Astro layout or component)

---

### 1.5 Guide pages are missing `Article` and `FAQPage` structured data

**Problem:** The tax credit guide and laws guide are high-quality, substantial content pages — but they're not marked up with structured data. The tax credit guide has a full FAQ section at the bottom that could earn FAQ rich results in Google SERPs. The laws guide has a table structure that could be marked up.

**Fix:**

- Add `Article` JSON-LD to all guide pages with: `datePublished`, `dateModified`, `author`, `headline`, `description`
- Add `FAQPage` JSON-LD to the tax credit guide using the existing Q&A section at the bottom of the page
- Add `FAQPage` structured data to any other guide with a Q&A section
- The "On This Page" table of contents already present on guides is a good signal — make sure it's also reflected in the structured data

**Files likely involved:** guide page template, individual guide `.md` or `.astro` files

---

### 1.6 `BreadcrumbList` structured data — verify it's actually in the HTML `<head>`

**Problem:** Breadcrumbs are visually present on every page (Home > Shops > California > San Francisco > Shop Name), which is great. But visual breadcrumbs only help SEO if they're also output as `BreadcrumbList` JSON-LD in the page head. This needs verification — the markdown rendering of the page doesn't show `<head>` content.

**Fix:**

- Confirm `BreadcrumbList` JSON-LD is being generated for all pages with visual breadcrumbs
- If not, add it. Example for a shop page:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://ebikelocal.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Shops",
      "item": "https://ebikelocal.com/shops/"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "California",
      "item": "https://ebikelocal.com/shops/california/"
    },
    {
      "@type": "ListItem",
      "position": 4,
      "name": "San Francisco",
      "item": "https://ebikelocal.com/shops/california/san-francisco-ca/"
    },
    {
      "@type": "ListItem",
      "position": 5,
      "name": "The New Wheel Electric Bikes"
    }
  ]
}
```

---

### 1.7 Canonical tags — audit for trailing slash consistency

**Problem:** The site appears to serve pages with and without trailing slashes (e.g., `/shops/california/` and `/shops/california` both appear to resolve). Without explicit canonical tags pointing to one canonical form, Google may index both versions as duplicate pages — diluting link equity across 10,000+ URLs.

**Fix:**

- Pick one canonical form (trailing slash is conventional for Astro directory-style routes) and enforce it universally
- Add `<link rel="canonical" href="[URL with trailing slash]" />` to every page's `<head>`
- Add a Vercel redirect rule (in `vercel.json`) to 301-redirect the non-trailing-slash version to the trailing slash version for all routes, or vice versa — whichever you choose, be consistent

---

### 1.8 Image `alt` text on shop cards is missing or generic

**Problem:** Shop card images (the Google Places photos) are being rendered with no `alt` text visible, or with just the shop name. Descriptive alt text on images serves both accessibility and image SEO.

**Fix:**

- Set `alt` text on shop card images to: `"[Shop Name] — eBike shop in [City], [State]"`
- Set `alt` text on hero images on shop detail pages to: `"[Shop Name] storefront, [City] [State]"`
- Set `alt` text on brand logo images to: `"[Brand Name] eBike logo"` — these are already likely correct but worth verifying

---

### 1.9 Brands index page is missing a `<meta description>` and editorial intro

**Problem:** `/brands/` has a good H1 ("Compare eBike Brands") and solid brand cards, but like the state pages, there's no editorial paragraph framing the content. It also likely lacks a meta description.

**Fix:**

- Add meta description: `"Compare all major eBike brands — Trek, Specialized, Aventon, Giant, and more. See price ranges, dealer counts, and find a local shop that carries the brand you want."`
- Add a 2–3 sentence intro below the H1:
  > _"We track 15+ electric bike brands and aggregate their dealer data so you can compare options in one place. From premium brands like Trek and Specialized to value-focused options like Aventon and Lectric, each brand page shows local dealers, model specs, and current pricing."_

---

### 1.10 Pedego affiliate rate displays as `"% affiliate"` — data bug

**Problem:** On the `/brands/` index page, the Pedego card shows `"% affiliate"` — the percentage value is clearly missing from the data. This looks broken.

**Fix:**

- Check the Pedego brand record in the database/data file for a missing `affiliate_rate` value
- Either populate the correct rate (Pedego's affiliate commission) or conditionally render the affiliate badge only when the rate value is non-null/non-empty

---

### 1.11 Duplicate shop: "Velocipede Cyclery" and "Velocipede" in San Francisco

**Problem:** The SF city page lists both "Velocipede Cyclery" (2405 3rd St, 4.3 stars, 147 reviews, carries Aventon/Trek/Velotric) and "Velocipede" (2405 3rd Street, no rating) — same address, same business. The previous dedup fix didn't catch this one. These are the same place.

**Fix:**

- Add this address pattern to the dedup check: `2405 3rd St` / `2405 3rd Street` San Francisco — same normalization issue as the Meteor case
- Broader fix: ensure the address normalization step strips `"Street"` → `"St"`, `"Avenue"` → `"Ave"`, `"Boulevard"` → `"Blvd"` etc. before comparing
- Keep the record with more reviews and higher data quality (Velocipede Cyclery with 147 reviews over the empty record)

---

### 1.12 "Hightrails" and "High Trails Cyclery Bike Shop" are likely duplicates in SF

**Problem:** The SF page lists both "High Trails Cyclery Bike Shop" at 1825 Polk St (4.8 stars, 152 reviews) and "Hightrails" at 1825 Polk St (no rating, Specialized dealer). Same address — almost certainly the same business, different data sources.

**Fix:**

- Same dedup logic — same address match should catch this
- Merge into the record with more data (High Trails Cyclery Bike Shop)

---

## Priority 2 — Within First 2 Weeks Post-Launch

### 2.1 Submit sitemap to Google Search Console on day one

**Action:**

- Verify the site in Google Search Console using the domain property (ebikelocal.com, not the Vercel URL)
- Submit `/sitemap.xml` immediately after launch
- Confirm the sitemap includes all page types: shop pages, city pages, state pages, brand pages, bike pages, guide pages
- Set up GSC email alerts for coverage issues and manual actions

---

### 2.2 Verify the sitemap structure is complete and correct

**Problem:** Not yet audited but critical — with 10,000+ pages, the sitemap needs to be paginated (multiple sitemap files linked from a sitemap index) if it exceeds 50,000 URLs or 50MB.

**Fix:**

- Generate a sitemap index at `/sitemap.xml` that references child sitemaps:
  - `/sitemap-shops.xml` — all shop detail pages
  - `/sitemap-cities.xml` — all city index pages
  - `/sitemap-states.xml` — all state index pages
  - `/sitemap-brands.xml` — brand and bike pages
  - `/sitemap-guides.xml` — guide and best-picks pages
- Set `<priority>` values: guides/best = 0.8, state/brand pages = 0.7, city pages = 0.7, shop pages = 0.5
- Set `<changefreq>`: guides = monthly, shop pages = weekly (hours/ratings change)

---

### 2.3 Add `robots.txt` if not already present

**Verify and fix:**

- Confirm `/robots.txt` exists and is accessible
- It should block: any admin routes, any URL containing `?` query params (filter states that shouldn't be indexed), any staging/preview paths
- It should allow all public content routes
- It must reference the sitemap: `Sitemap: https://ebikelocal.com/sitemap.xml`

---

### 2.4 City page "Nearby Cities" section uses geographic distance, not alphabetical

**Problem:** On the Austin TX city page, "Nearby Cities" shows Houston (30), San Antonio (22), Dallas (12), El Paso (11), Fort Worth (9), Brownsville (9), Corpus Christi (8), Galveston (6). El Paso is ~580 miles from Austin. Brownsville is ~240 miles. These are not "nearby" by any reasonable definition.

**Fix:**

- Sort the Nearby Cities section by actual geographic distance (haversine formula using lat/long coordinates), not by state-alphabetical or shop-count order
- Limit to cities within a reasonable radius — 75 miles for dense states (CA, TX, NY), 150 miles for sparse states (WY, MT, ND)
- For Austin, the correct nearby list would be: Round Rock, Cedar Park, Kyle, San Marcos, San Antonio, Waco, Georgetown — not El Paso

**Files likely involved:** city page template, possibly a `getNearbyCity()` utility

---

### 2.5 State pages are missing `<title>` tag optimization

**Problem:** The California state page `<title>` is `"eBike Shops in California — 1275 Dealers & Service Centers"`. The shop count in the title is fine editorially, but including it means the title changes every time a shop is added or removed — which triggers a re-crawl. More importantly, including "Service Centers" when the primary value prop is "dealers who carry specific brands" isn't the most targeted keyword choice.

**Fix:**

- Title template for state pages: `"eBike Shops in [State] — Find Local Dealers | eBikeLocal"`
- Title template for city pages: `"eBike Shops in [City], [State] — [N] Local Dealers | eBikeLocal"`
- Drop the shop count from the `<title>` tag (keep it in the H1 where it reads naturally and doesn't cause churn)
- The `| eBikeLocal` brand suffix aids click-through recognition once the brand builds familiarity

---

### 2.6 Add `Open Graph` and `Twitter Card` meta tags sitewide

**Problem:** Not confirmed present. When these pages are shared on social media or linked in Slack/Discord cycling communities, they'll render as plain unfurled links with no image preview — a major missed opportunity for click-through.

**Fix:**

- Add OG tags to all page types:
  - `og:title` — match the `<title>` tag
  - `og:description` — match the meta description
  - `og:image` — use the hero image for shop/guide pages; use a default branded fallback for index pages
  - `og:type` — `"website"` for index pages, `"article"` for guides
  - `og:url` — the canonical URL
- Add `twitter:card` = `"summary_large_image"` sitewide
- Create a default branded OG image (1200×630px) for pages without a hero photo

---

### 2.7 About page is too sparse for E-E-A-T purposes

**Problem:** The `/about/` page exists (good from last pass) but is very short and reads like a technical specification. Google's E-E-A-T quality guidelines specifically weight "experience" — for a site making buying recommendations on $1,000–$5,000 products, the about page needs to establish credibility more convincingly.

**Fix:**

- Expand to include:
  - Who built the site and why (even a first-person paragraph helps)
  - How long the project has been in development
  - The specific methodology for how brand dealer data is aggregated (this is already unique and defensible — explain it more concretely)
  - How buying guide recommendations are made (what criteria, how frequently updated)
  - A note on how shops can claim/update their listing
- Aim for 300–500 words total — not long, but substantive enough to pass a human reviewer's credibility check

---

### 2.8 Guide pages need `dateModified` visually displayed and kept current

**Problem:** The tax credit guide shows "Updated April 13, 2026" — good. But this needs to be maintained. A guide dated April 2026 that hasn't been touched in 6 months starts losing credibility and rankings on time-sensitive queries like "ebike tax credit 2026."

**Fix:**

- Add `dateModified` to the frontmatter of every guide page
- Display it visibly near the top ("Last updated: [date]")
- Create a monthly reminder or Cursor task to review and re-date guides that cover time-sensitive topics (tax credits, laws, rebate programs)
- For the laws guide specifically, consider a "Last verified: [date]" note per state section since laws change independently

---

### 2.9 Internal linking from guides to shop directory is good — add reverse links

**Problem:** Guide pages link to the shop directory ("Find a Shop →") which is good for conversion. But city and state shop pages don't link to relevant guides. This is a one-way internal link graph — you want it flowing both directions.

**Fix:**

- On state shop pages, the eBike Laws section already links to the state law guide — that's correct. Verify this exists for all states, not just California.
- On city shop pages, add a "Learn more" or "Buying Guides" section in the sidebar or below the shop list that links to:
  - How to Choose an eBike guide
  - The relevant state law guide
  - Best eBikes in a relevant price category (linking to `/best/best-ebikes-under-1500/` etc.)
- On bike detail pages, add a contextual link to the relevant buying guide (e.g., Soltera.2 → "Best eBikes Under $1,500")

---

## Priority 3 — Ongoing / Post-Launch Growth

### 3.1 Title tag for homepage needs refinement

**Current title:** `"eBikeLocal — Find eBike Shops, Brands & Bikes Near You"`

This is fine but the brand name "eBikeLocal" at the start means users who don't know the brand get no immediate signal. Consider:

**Better option:** `"Find eBike Shops Near You — eBikeLocal"`  
Or: `"Local eBike Dealers, Brands & Bikes — eBikeLocal"`

Leading with the value proposition before the brand name improves click-through for new users seeing the site for the first time in SERPs.

---

### 3.2 Brand pages need `ItemList` structured data for the bike model grid

**Problem:** Brand pages (e.g., `/brands/aventon/`) show a full catalog of bike models with prices and specs. This is exactly the type of content `ItemList` + `Product` schema is designed for. Without it, Google cannot create product-level rich results from these pages.

**Fix:**

- Add `ItemList` JSON-LD to brand pages wrapping the bike model grid
- Each item in the list should have: `name`, `url`, `image`, `offers` (price, currency, availability)
- Also consider `Product` schema on individual bike detail pages with `offers`, `brand`, `description`, `aggregateRating` if review data becomes available

---

### 3.3 Guides index page is too thin — add category organization

**Problem:** `/guides/` has 5 guides listed. That's the complete content of the page. No category grouping, no explanation of what's covered, no featured guide. As more guides are added, this page needs structure.

**Fix:**

- Organize by category: Laws & Regulations, Buying Guides, Tax & Finance, Maintenance & Safety
- Add a short intro paragraph (2–3 sentences)
- Feature the highest-traffic guide (likely the tax credit or laws page) more prominently at the top
- Add a "Coming soon" or "Recently added" section to signal active publishing

---

### 3.4 Add FAQ sections to city pages targeting "people also ask" queries

**Problem:** City pages currently have no FAQ content. Google's "People Also Ask" boxes for queries like "ebike shops San Francisco" typically surface questions like "Do I need a license for an eBike in California?" and "What eBike brands are available in San Francisco?" These can be answered with data you already have.

**Fix:**

- Add a small FAQ section at the bottom of city pages (2–3 Q&As) using data from the page:
  - Q: "Do I need a license to ride an eBike in [City], [State]?" A: "[Pull from state law data]"
  - Q: "What eBike brands are available in [City]?" A: "[List from Brands Available section]"
  - Q: "How many eBike shops are in [City]?" A: "[N] shops, including [top 2–3 by rating]"
- Mark up with `FAQPage` JSON-LD
- Even simple FAQ schema can drive significantly more SERP real estate (especially on mobile)

---

### 3.5 Consider adding `rel="nofollow"` or `rel="sponsored"` to outbound affiliate links

**Problem:** Outbound "Check Price at [Brand]" and "Visit Website" links on brand and bike pages pass PageRank to external sites by default. Google's guidelines require `rel="sponsored"` on affiliate links. Not doing this is technically a violation that can result in a manual action.

**Fix:**

- Add `rel="nofollow sponsored"` to all affiliate outbound links (the "Check Price at Aventon" CTAs on bike pages)
- Add `rel="nofollow"` to "Visit Website" on shop pages (these are not affiliate links, but nofollow is appropriate for user-submitted/aggregated business URLs)
- Pure informational links (linking to `cleanvehiclerebate.org` in the tax credit guide) do not need nofollow

---

## Summary — Launch Blockers vs. Nice-to-Haves

| Item                                            | Launch Blocker?   | Effort              |
| ----------------------------------------------- | ----------------- | ------------------- |
| 1.1 Fix homepage H1                             | ✅ Yes            | 5 min               |
| 1.2 State page content + meta descriptions      | ✅ Yes            | 2–3 hrs (templated) |
| 1.3 City page intro content + meta descriptions | ✅ Yes            | 2–3 hrs (templated) |
| 1.4 LocalBusiness schema on shop pages          | ✅ Yes            | 2 hrs               |
| 1.5 Article + FAQPage schema on guides          | ✅ Yes            | 1 hr                |
| 1.6 Verify BreadcrumbList JSON-LD in `<head>`   | ✅ Yes            | 30 min              |
| 1.7 Canonical tags + trailing slash enforcement | ✅ Yes            | 1 hr                |
| 1.8 Image alt text on shop cards                | ✅ Yes            | 1 hr (templated)    |
| 1.9 Brands index meta description + intro       | ✅ Yes            | 20 min              |
| 1.10 Fix Pedego affiliate rate display bug      | ✅ Yes            | 10 min              |
| 1.11–1.12 Additional SF duplicate shops         | ✅ Yes            | 30 min              |
| 2.1 Submit sitemap to GSC                       | Post-launch day 1 | 15 min              |
| 2.2 Sitemap structure + pagination              | Post-launch       | 1–2 hrs             |
| 2.3 robots.txt audit                            | Pre-launch        | 30 min              |
| 2.4 Nearby cities use actual geo distance       | Post-launch       | 2 hrs               |
| 2.5 Title tag optimization                      | Pre-launch        | 1 hr (templated)    |
| 2.6 Open Graph / Twitter Card meta              | Pre-launch        | 1–2 hrs             |
| 2.7 Expand About page                           | Pre-launch        | 30 min              |
| 2.8 Guide dateModified maintenance              | Ongoing           | —                   |
| 2.9 Reverse internal links guides ↔ shops       | Post-launch       | 2 hrs               |
| 3.1–3.5 Ongoing SEO improvements                | Post-launch       | —                   |

---

## Notes for Cursor

- Items 1.1 through 1.3 are pure template changes — find the Astro page template for state, city, and home pages and make the H1 and intro changes there
- Items 1.4–1.6 are all structured data additions — these belong in the `<head>` of each page type, ideally as server-rendered JSON-LD blocks generated from the page's data props
- Item 1.7 (canonicals + trailing slash) may already be handled by Astro's default routing — verify first before adding duplicate logic
- Item 2.4 (nearby cities by geo distance) requires a haversine distance utility function — write once, use everywhere
- For all templated meta descriptions and intro copy, use the existing data fields (shop count, city count, top brands array) to generate unique-per-page content rather than hardcoding strings
