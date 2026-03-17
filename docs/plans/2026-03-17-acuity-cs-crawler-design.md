# Acuity Contractor Select Crawler — Design

**Date:** 2026-03-17
**Status:** Approved

## Goal

Crawl Acuity Brands' Contractor Select™ program catalog into the KB as a separate manufacturer (`acuity-cs`). These are value-engineered everyday commercial lighting SKUs. The cross-reference engine will surface them as `BUDGET_ALTERNATIVE` matches against Elite and standard Acuity products.

## Approach

Separate crawler file (`lib/crawler/acuity-cs.ts`) so it can be run independently with `--manufacturer=acuity-cs`, decoupled from the 2-hour full Acuity crawl.

## Components

### 1. `prisma/seed.ts`
- Add `acuity-cs` manufacturer (`name: 'Acuity Contractor Select'`, `website: 'https://www.acuitybrands.com/resources/programs/contractor-select'`)
- Add 11 root categories:
  - `downlights`
  - `panels-troffers-wraparounds`
  - `highbay-strip`
  - `outdoor`
  - `controls`
  - `emergency-exit`
  - `programmable-drivers`
  - `surface-flush-mount`
  - `switchable`
  - `undercabinet`
  - `vanities`

### 2. `lib/crawler/acuity-cs.ts`
- Entry URL: `https://www.acuitybrands.com/resources/programs/contractor-select`
- Discover CS category tile URLs from that landing page (tiles link to standard Coveo `/products/` listing pages filtered for Contractor Select)
- Reuse same patterns as `acuity.ts`: stealth browser context, infinite-scroll product URL collection, spec table extraction, PDF download, thumbnail download
- Exports: `crawlAcuityCS`, `AcuityCsProduct`, `ACUITY_CS_ROOT_CATEGORY_PATHS`
- `catalogNumber` = numeric product ID from `/products/detail/{ID}/` URL (same as Acuity)
- Spec sheets saved under `acuity-cs` namespace (e.g. `public/spec-sheets/acuity-cs/`)

### 3. `scripts/crawl.ts`
- Import `crawlAcuityCS`, `AcuityCsProduct`, `ACUITY_CS_ROOT_CATEGORY_PATHS`
- Add `acuity-cs` to `defaultCategories` resolution
- Add `manufacturer === 'acuity-cs'` branch → `crawlAcuityCS(categories)`

### 4. Cross-Reference Engine (`lib/cross-reference.ts`)
- When target product's manufacturer slug is `acuity-cs`, override `matchType` to `BUDGET_ALTERNATIVE`
- Add to match reason: "Acuity Contractor Select value-engineered alternative"

## CLI Usage

```bash
npm run db:seed                              # adds acuity-cs manufacturer + categories
npm run crawl -- --manufacturer=acuity-cs   # crawl CS catalog only
```

## Data Flow

```
CS Landing Page
  → discover tile URLs (Coveo category pages)
  → per tile: infinite-scroll to collect /products/detail/{id}/ URLs
  → per product: extract spec table, download PDF, download thumbnail
  → upsert into DB under acuity-cs manufacturer
  → cross-reference engine tags matches as BUDGET_ALTERNATIVE
```

## Success Criteria
- All 11 CS categories populated with products
- Spec table confidence ≥ 0.7 on average (same bar as Acuity)
- Spec sheet PDFs downloaded where available
- Cross-reference matches from any manufacturer to CS products tagged `BUDGET_ALTERNATIVE`
