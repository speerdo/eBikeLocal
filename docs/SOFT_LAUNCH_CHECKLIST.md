# eBikeLocal — Soft Launch Checklist

> Generated from a full codebase audit against SEO, accessibility (ADA/WCAG 2.1 AA), and content completeness.
> Work top-to-bottom. Mark items `[x]` as they're completed.

---

## Section 1 — Accessibility (ADA/WCAG 2.1 AA) — Fix Before Launch

### 1.1 Add skip-to-content link — WCAG 2.4.1
**Status:** Missing  
**File:** `src/layouts/BaseLayout.astro` — before the `<header>` tag  
**Fix:** Add a visually-hidden link that becomes visible on focus:
```html
<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-brand-400 focus:px-4 focus:py-2 focus:text-night-900 focus:font-700">
  Skip to content
</a>
```
Also add `id="main-content"` to the `<main>` element.

### 1.2 Homepage search input missing `<label>` — WCAG 1.3.1
**Status:** Missing — only has a placeholder  
**File:** `src/pages/index.astro` ~line 121  
**Fix:** Add a visually-hidden label:
```html
<label for="hero-search" class="sr-only">Search by city, state, or zip code</label>
<input id="hero-search" type="text" name="q" ... />
```

### 1.3 Duplicate SVG gradient ID in ShopCard — Invalid HTML + visual bug
**Status:** Bug — `id="half-star-sc"` used on every shop card; duplicate IDs cause the half-star to use wrong gradient when multiple cards render  
**File:** `src/components/ui/ShopCard.astro` ~line 100  
**Fix:** Make the ID unique using the shop slug (or use `Math.random()` at build time). A simpler fix: use `clip-path` instead of a gradient, or use a unique component-scoped ID via a counter.

### 1.4 Mobile nav button missing `aria-controls` — WCAG 4.1.2
**Status:** Missing  
**File:** `src/layouts/BaseLayout.astro` ~line 134  
**Fix:** Add `aria-controls="mobile-menu"` to the `<button id="mobile-menu-btn">`.

### 1.5 Brand filter chips: no aria-live for screen readers — WCAG 4.1.3
**Status:** Missing  
**File:** `src/pages/shops/[stateSlug]/[citySlug]/index.astro` ~line 241  
**Fix:** Add `aria-live="polite"` and `aria-atomic="false"` to the shop list container (`id="city-shop-list"`), or add a visually-hidden status element that announces the count of visible results after filtering.

### 1.6 Add `prefers-reduced-motion` CSS — WCAG 2.3.3
**Status:** Missing  
**File:** `src/styles/global.css`  
**Fix:** Add at the end of the file:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Section 2 — SEO — Fix Before Launch

### 2.1 Shop detail page: hero image alt text is non-descriptive
**Status:** Bug — alt is just `{shop.name}`, e.g. `"Campus Cycles"` instead of `"Campus Cycles storefront, Denver, CO"`  
**File:** `src/pages/shops/[stateSlug]/[citySlug]/[shopSlug].astro` ~line 206  
**Fix:** Change to `alt={`${shop.name} storefront, ${shop.city}, ${shop.state_code}`}`

### 2.2 Shop detail page: gallery image alt text is non-descriptive
**Status:** Same issue — `alt={shop.name}`  
**File:** Same file ~line 290  
**Fix:** Change to `alt={`${shop.name} — photo ${idx + 1}, ${shop.city}, ${shop.state_code}`}`

### 2.3 Brand logo alt text in shop detail
**Status:** `alt={brand.name}` — acceptable but could be more descriptive  
**File:** Same file ~line 238  
**Fix:** Change to `alt={`${brand.name} eBike logo`}`

### 2.4 FAQPage JSON-LD missing from tax credit guide
**Status:** Missing — the tax credit guide has an FAQ section that qualifies for rich results  
**File:** `src/pages/guides/[slug].astro` and guide content files  
**Fix:** Parse the FAQ section from the guide markdown (or manually add a `faqs` array to frontmatter), then add `FAQPage` JSON-LD alongside the existing `Article` schema. The `FAQSchema.astro` component already exists at `src/components/seo/FAQSchema.astro` — use it.

### 2.5 Verify Pedego affiliate rate display bug
**Status:** Guarded by `brand.affiliate_commission_rate &&` check — likely fixed, but spot-check in the live site.  
**File:** `src/pages/brands/index.astro` ~line 79  
**Fix:** If the rate renders as `"% affiliate"` with no number, the value is stored as `""` or `"0"` (truthy string). Add `Number(brand.affiliate_commission_rate) > 0 &&` guard.

### 2.6 Canonical URL trailing slash consistency
**Status:** BaseLayout uses `Astro.url.pathname` directly for canonical — may omit trailing slash on some routes  
**File:** `src/layouts/BaseLayout.astro` ~line 15  
**Fix:** Enforce trailing slash: `canonicalUrl = \`\${siteUrl.replace(/\/$/, '')}${Astro.url.pathname.endsWith('/') ? Astro.url.pathname : Astro.url.pathname + '/'}\``  
Also verify Astro's `trailingSlash` config in `astro.config.mjs` is set to `'always'`.

---

## Section 3 — Content — Fix Before Launch

### 3.1 About page needs E-E-A-T expansion
**Status:** Current ~180 words is too thin for Google's quality guidelines on a site making $1K–5K product recommendations  
**File:** `src/pages/about.astro`  
**Fix:** Expand to 350–500 words adding:
- Who built it and the motivation (first-person voice)
- How long in development / launch date
- Specific methodology for brand data aggregation (the 15+ brand locator sources, cross-referenced with Google Places)
- How shop recommendations are made (what criteria)
- How shops can claim/update their listing ("Contact us at...")
- A link to the affiliate disclosure

### 3.2 Brand pages still lack editorial positioning copy
**Status:** Ongoing from PRELAUNCH docs — brand pages have one paragraph then stats  
**File:** `src/pages/brands/[brandSlug]/index.astro`  
**Fix:** Add 150–200 words of editorial context below the stats section: who Trek eBikes are for, how Aventon's lineup is positioned vs. competitors, Specialized's premium positioning, etc. This content can be stored as a `editorial_intro` field in the brands table or as a content collection.

---

## Section 4 — Technical / Performance — Fix Before Launch

### 4.1 Google Fonts loaded via CSS @import (render-blocking)
**Status:** `global.css` starts with `@import url('https://fonts.googleapis.com/...')` which is render-blocking  
**File:** `src/styles/global.css` line 1, and `src/layouts/BaseLayout.astro`  
**Fix:** Remove the `@import` from CSS and add to `<head>` in BaseLayout:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800;1,14..32,400&display=swap" />
```

### 4.2 Add `<meta name="theme-color">` for mobile browser chrome
**Status:** Missing  
**File:** `src/layouts/BaseLayout.astro` in `<head>`  
**Fix:** `<meta name="theme-color" content="#0d1120" />` (matches `--color-night-900`)

---

## Section 5 — Post-Launch (First 2 Weeks)

- [ ] Submit sitemap to Google Search Console on day 1 — verify ebikelocal.com domain property
- [ ] Add `FAQPage` schema to any other guide pages with Q&A sections
- [ ] Add FAQ sections (2–3 Q&As) to city pages targeting "People Also Ask" results
- [ ] Reverse internal links: city/state shop pages should link to relevant buying guides and law pages (the buying resources section on city pages already does this — verify it's on all city pages, not selectively)
- [ ] Brand pages: add `ItemList` + `Product` JSON-LD for the bike model grid (Priority 3 SEO)

---

## Summary — What's Already Done

These items were flagged in prior audits and are confirmed fixed:

- ✅ Homepage H1: "Find eBike Shops Near You" — correct
- ✅ State page title tags: `"eBike Shops in [State] — Find Local Dealers | eBikeLocal"` 
- ✅ City page title tags: `"eBike Shops in [City], [STATE] — Find Local Dealers | eBikeLocal"`
- ✅ State page editorial intro with unique sentence per state (stateContextByCode)
- ✅ City page intro paragraph with brand names
- ✅ Haversine distance sorting for nearby cities
- ✅ BikeStore JSON-LD schema on all shop detail pages
- ✅ Article JSON-LD schema on guide pages
- ✅ BreadcrumbList JSON-LD on all pages (in Breadcrumb UI component)
- ✅ Canonical tags on all pages (BaseLayout)
- ✅ Open Graph + Twitter Card meta tags (BaseLayout)
- ✅ Shop card image alt text: `"${name} — eBike shop in ${city}, ${stateCode}"`
- ✅ `rel="nofollow noopener sponsored"` on all affiliate CTA buttons
- ✅ `rel="nofollow noopener"` on shop website links
- ✅ `lang="en"` on html element
- ✅ `focus-visible` CSS styles for keyboard navigation
- ✅ robots.txt present and correct (includes Sitemap reference)
- ✅ Sitemap covers all page types with priorities
- ✅ `authorized_online` dealer tier mapped to "Authorized" in shop detail
- ✅ Rad Power Bikes Chapter 11 warning badge on shop cards + brand pages
- ✅ Meta description on brands index page
- ✅ Affiliate disclosure on brands index page (conditional render guard exists)

---

## Checklist Summary Table

| # | Item | Category | Effort | Status |
|---|------|----------|--------|--------|
| 1.1 | Skip-to-content link | ADA | 10 min | ✅ |
| 1.2 | Search input label | ADA | 5 min | ✅ |
| 1.3 | Duplicate SVG gradient ID | ADA + HTML | 15 min | ✅ |
| 1.4 | Mobile nav `aria-controls` | ADA | 5 min | ✅ |
| 1.5 | Brand filter `aria-live` | ADA | 15 min | ✅ |
| 1.6 | `prefers-reduced-motion` CSS | ADA | 5 min | ✅ |
| 2.1 | Shop hero image alt text | SEO | 5 min | ✅ |
| 2.2 | Shop gallery image alt text | SEO | 5 min | ✅ |
| 2.3 | Brand logo alt text | SEO | 5 min | ✅ |
| 2.4 | FAQPage JSON-LD on tax credit guide | SEO | 30 min | ✅ |
| 2.5 | Pedego affiliate rate spot-check | SEO | 10 min | ✅ |
| 2.6 | Canonical URL trailing slash enforcement | SEO | 15 min | ✅ |
| 3.1 | About page expansion (E-E-A-T) | Content | 30 min | ✅ |
| 3.2 | Brand page editorial copy | Content | 2 hrs | ❌ post-launch |
| 4.1 | Google Fonts preconnect (non-blocking) | Perf | 10 min | ✅ |
| 4.2 | `<meta name="theme-color">` | Technical | 2 min | ✅ |
