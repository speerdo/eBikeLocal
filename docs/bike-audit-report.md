# Bike catalog audit — 2026-04-17

Active bikes in DB: **99** across **15** brands.

## 1. Per-brand summary

| Brand | Active | Missing image | Missing affiliate | Missing core specs |
|---|---:|---:|---:|---:|
| Aventon (aventon) | 20 | 0 | 0 | 3 |
| Cannondale (cannondale) | 2 | 1 | 0 | 1 |
| EVELO (evelo) | 4 | 0 | 0 | 4 |
| Gazelle (gazelle) | 1 | 1 | 0 | 1 |
| Giant (giant) | 3 | 1 | 0 | 1 |
| Himiway (himiway) | 11 | 0 | 0 | 6 |
| Lectric eBikes (lectric) | 9 | 0 | 0 | 8 |
| Pedego (pedego) | 10 | 0 | 0 | 2 |
| QuietKat (quietkat) | 6 | 0 | 0 | 2 |
| Rad Power Bikes (rad-power-bikes) | 10 | 0 | 0 | 2 |
| Ride1UP (ride1up) | 3 | 2 | 0 | 2 |
| Specialized (specialized) | 2 | 2 | 0 | 2 |
| Tern (tern) | 3 | 1 | 0 | 1 |
| Trek (trek) | 5 | 2 | 0 | 2 |
| Velotric (velotric) | 10 | 0 | 0 | 1 |

## 2. Category coverage — ✅ = present, ❌ = zero bikes

| Brand | commuter | cruiser | cargo | folding | mountain | fat-tire | road-gravel | moped-style | hunting | step-through |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| aventon | 6 | 1 | 1 | ❌ | 3 | 3 | 2 | ❌ | ❌ | 4 |
| cannondale | 1 | ❌ | ❌ | ❌ | 1 | ❌ | ❌ | ❌ | ❌ | ❌ |
| evelo | 2 | ❌ | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 1 |
| gazelle | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 1 |
| giant | 1 | ❌ | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| himiway | 3 | ❌ | 2 | 1 | 1 | ❌ | ❌ | 1 | 1 | 2 |
| lectric | 1 | ❌ | 2 | 2 | 2 | ❌ | ❌ | ❌ | ❌ | 2 |
| pedego | 6 | 1 | ❌ | ❌ | 1 | ❌ | ❌ | ❌ | ❌ | 2 |
| quietkat | ❌ | ❌ | 2 | ❌ | 1 | ❌ | ❌ | ❌ | 3 | ❌ |
| rad-power-bikes | 1 | ❌ | 5 | 1 | ❌ | 1 | 1 | ❌ | 1 | ❌ |
| ride1up | 1 | ❌ | 1 | ❌ | 1 | ❌ | ❌ | ❌ | ❌ | ❌ |
| specialized | ❌ | 1 | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| tern | 1 | ❌ | 1 | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| trek | 1 | ❌ | 1 | ❌ | 1 | ❌ | 1 | ❌ | ❌ | 1 |
| velotric | 5 | 1 | 1 | 1 | ❌ | 1 | 1 | ❌ | ❌ | ❌ |

**Gaps identified:** 91 (brand × category cells with zero bikes)

## 3. Affiliate URL health

_(skipped — rerun without `--skip-urls`)_

## 4. Duplicate / near-duplicate models

_Token-Jaccard ≥ 0.60 on model name, same brand._

| Brand | Sim | A | B |
|---|---:|---|---|
| Aventon | 0.60 | Level 4 ADV Ebike ($2799) `aventon-level-4-adv-ebike` | Level 4 ADV Step-Through Ebike ($2799) `aventon-level-4-adv-step-through-ebike` |
| Aventon | 0.67 | Level 4 ADV Step-Through Ebike ($2799) `aventon-level-4-adv-step-through-ebike` | Level 4 REC Step-Through Ebike ($1999) `aventon-level-4-rec-step-through-ebike` |
| Aventon | 0.60 | Level 4 REC Ebike ($1999) `aventon-level-4-rec-ebike` | Level 4 REC Step-Through Ebike ($1999) `aventon-level-4-rec-step-through-ebike` |
| Aventon | 0.60 | Pace 500.3 Ebike ($1499) `aventon-pace-5003` | Pace 500.3 Step-Through Ebike ($1799) `aventon-pace500-3-step-through-ebike` |
| Aventon | 0.67 | Soltera 2 Ebike ($999) `aventon-soltera-2-ebike` | Soltera 2.5 Ebike ($1199) `aventon-soltera-2-5-ebike` |
| Aventon | 1.00 | Soltera 2 Ebike ($999) `aventon-soltera-2-ebike` | Soltera.2 ($1099) `aventon-soltera2` |
| Aventon | 0.67 | Soltera 2.5 Ebike ($1199) `aventon-soltera-2-5-ebike` | Soltera.2 ($1099) `aventon-soltera2` |
| Himiway | 0.60 | D5 2.0 Camo eBike ($2399) `himiway-d5-st-camo` | D5 2.0 ST eBike ($2199) `himiway-d5-st` |
| Himiway | 0.75 | D5 2.0 Camo eBike ($2399) `himiway-d5-st-camo` | D5 2.0 eBike ($2199) `himiway-d5` |
| Himiway | 0.75 | D5 2.0 ST eBike ($2199) `himiway-d5-st` | D5 2.0 eBike ($2199) `himiway-d5` |
| Lectric eBikes | 0.60 | XPeak2 High-Step Long-Range eBike ($1499) `lectric-xpeak-high-step-long-range-ebike` | XPeak2 High-Step eBike ($1299) `lectric-xpeak-high-step-ebike` |
| QuietKat | 1.00 | Ranger XR ($2500) `quietkat-ranger-xr` | Ranger XR ($2000) `quietkat-ranger` |
| Rad Power Bikes | 0.80 | RadRunner Electric Cargo Utility Bike ($1499) `rad-power-bikes-radrunner-electric-cargo-utility-bike` | RadRunner Max Electric Cargo Utility Bike ($2299) `rad-power-bikes-radrunner-max-electric-cargo-utility-bike` |
| Rad Power Bikes | 0.80 | RadRunner Electric Cargo Utility Bike ($1499) `rad-power-bikes-radrunner-electric-cargo-utility-bike` | RadRunner Plus Electric Cargo Utility Bike ($1799) `rad-power-bikes-radrunner-plus-electric-cargo-utility-bike` |
| Rad Power Bikes | 0.67 | RadRunner Max Electric Cargo Utility Bike ($2299) `rad-power-bikes-radrunner-max-electric-cargo-utility-bike` | RadRunner Plus Electric Cargo Utility Bike ($1799) `rad-power-bikes-radrunner-plus-electric-cargo-utility-bike` |
| Rad Power Bikes | 0.60 | RadWagon 5 Electric Cargo Bike ($2399) `rad-power-bikes-radwagon-electric-cargo-bike` | RadWagon™ 4 Electric Cargo Bike ($1299) `rad-power-bikes-radwagon-4` |
| Velotric | 0.60 | Velotric Discover 1 Plus Ebike ($1699) `velotric-discover-1` | Velotric Nomad 1 Plus Ebike ($1899) `velotric-nomad-1` |

## 5. Outdated models (Shopify-brand diff)

_(skipped — rerun without `--skip-live`)_

## 6. Mis-categorized step-through bikes

No obvious miscategorizations.

---
## Summary

- 99 active bikes across 15 brands
- 91 brand×category gaps (out of 150 possible cells)
- 0 broken/questionable affiliate URLs (checks skipped)
- 17 duplicate-candidate pairs
- 0 outdated (Shopify-diff) models (checks skipped)
- 0 mis-categorized step-through bikes

Next step: run `npm run discover:bikes` to populate gap candidates.
