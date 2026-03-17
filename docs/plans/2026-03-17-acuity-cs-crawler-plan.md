# Acuity Contractor Select Crawler — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Crawl Acuity Brands' Contractor Select™ catalog into the KB as a separate `acuity-cs` manufacturer so value-engineered alternatives can be surfaced in the cross-reference engine.

**Architecture:** New crawler file `lib/crawler/acuity-cs.ts` (copied from `acuity.ts` pattern) targeting the CS program landing page, a new `acuity-cs` manufacturer + 11 root categories in the seed, a new `--manufacturer=acuity-cs` branch in `scripts/crawl.ts`, and a one-line override in the cross-reference engine to force `BUDGET_ALTERNATIVE` match type when the target product belongs to `acuity-cs`.

**Tech Stack:** Playwright 1.58, Cheerio, pLimit, @anthropic-ai/sdk, Prisma 5, TypeScript 5 / ts-node

---

## Context You Need

- `lib/crawler/acuity.ts` — the existing Acuity crawler; copy its patterns exactly
- `lib/crawler/parser.ts` — `extractByAI`, `computeOverallConfidence`, `RawSpecs`
- `lib/crawler/normalize.ts` — `normalizeVoltage`, `normalizeDimmingTypes`, `normalizeMountingTypes`, `normalizeFormFactor`
- `lib/storage.ts` — `saveSpecSheet`, `getSpecSheetPath`
- `lib/thumbnails.ts` — `getThumbnailPath`
- `lib/cross-reference.ts` — line ~434 where `determineMatchType` is called
- `prisma/seed.ts` — existing manufacturer + category seeding pattern
- `scripts/crawl.ts` — existing `--manufacturer=acuity|cooper|current|lutron` routing

The `ProductWithManufacturer` type in `cross-reference.ts` includes `manufacturer: { name: string; slug: string }` on the target — use that to detect `acuity-cs`.

---

## Task 1: Seed `acuity-cs` Manufacturer + Categories

**Files:**
- Modify: `prisma/seed.ts`

**Step 1: Add manufacturer and categories to seed.ts**

After the Lutron block (end of file, before the `console.log`), add:

```typescript
// ─── Acuity Contractor Select — 11 top-level browse categories ───────────────
await prisma.manufacturer.upsert({
  where: { slug: 'acuity-cs' },
  update: { name: 'Acuity Contractor Select' },
  create: {
    name: 'Acuity Contractor Select',
    slug: 'acuity-cs',
    website: 'https://www.acuitybrands.com/resources/programs/contractor-select',
  },
})
const acuityCS = await prisma.manufacturer.findUniqueOrThrow({ where: { slug: 'acuity-cs' } })

const ACUITY_CS_ROOT_CATEGORIES = [
  { name: 'Downlights',                      slug: 'downlights' },
  { name: 'Panels, Troffers & Wraparounds',  slug: 'panels-troffers-wraparounds' },
  { name: 'Highbay & Strip Lights',          slug: 'highbay-strip' },
  { name: 'Outdoor',                         slug: 'outdoor' },
  { name: 'Controls',                        slug: 'controls' },
  { name: 'Emergency & Exit',                slug: 'emergency-exit' },
  { name: 'Programmable LED Drivers',        slug: 'programmable-drivers' },
  { name: 'Surface / Flush Mount',           slug: 'surface-flush-mount' },
  { name: 'Switchable',                      slug: 'switchable' },
  { name: 'Undercabinet',                    slug: 'undercabinet' },
  { name: 'Vanities',                        slug: 'vanities' },
]

for (let i = 0; i < ACUITY_CS_ROOT_CATEGORIES.length; i++) {
  const { name, slug } = ACUITY_CS_ROOT_CATEGORIES[i]
  await prisma.category.upsert({
    where: { manufacturerId_path: { manufacturerId: acuityCS.id, path: slug } },
    update: { name, sortOrder: i },
    create: { manufacturerId: acuityCS.id, name, slug, path: slug, sortOrder: i },
  })
}
```

Also update the final `console.log` to mention acuity-cs.

**Step 2: Run seed and verify**

```bash
cd /Users/tylergilstrap/Desktop/atlantiskb-lighting
npm run db:seed
```

Expected output includes: `Seeded` with no errors. Then verify in Prisma Studio:

```bash
npm run db:studio
```

Check `Manufacturer` table has `acuity-cs`, `Category` table has 11 rows with `manufacturerId` = acuity-cs's ID.

**Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed acuity-cs manufacturer and 11 contractor-select categories"
```

---

## Task 2: Create `lib/crawler/acuity-cs.ts`

**Files:**
- Create: `lib/crawler/acuity-cs.ts`

This crawler is structurally identical to `acuity.ts`. The main difference is the entry point URL and how we discover CS-specific product listing pages.

**Step 1: Create the file with imports and constants**

```typescript
import { chromium, Browser, BrowserContext, Page, APIRequestContext } from 'playwright'
import https from 'https'
import http from 'http'
import path from 'path'
import pLimit from 'p-limit'
import { extractByAI, computeOverallConfidence } from './parser'
import type { RawSpecs } from './parser'
import {
  normalizeVoltage,
  normalizeDimmingTypes,
  normalizeMountingTypes,
  normalizeFormFactor,
} from './normalize'
import { saveSpecSheet, getSpecSheetPath } from '../storage'
import { getThumbnailPath } from '../thumbnails'
import type { CrawlEvidence, FieldProvenanceMap } from '../types'
import fs from 'fs'

const BASE_URL = 'https://www.acuitybrands.com'
const CS_LANDING_URL = 'https://www.acuitybrands.com/resources/programs/contractor-select'

export const ACUITY_CS_ROOT_CATEGORY_PATHS: Record<string, string> = {
  'downlights':                 'downlights',
  'panels-troffers-wraparounds': 'panels-troffers-wraparounds',
  'highbay-strip':              'highbay-strip',
  'outdoor':                    'outdoor',
  'controls':                   'controls',
  'emergency-exit':             'emergency-exit',
  'programmable-drivers':       'programmable-drivers',
  'surface-flush-mount':        'surface-flush-mount',
  'switchable':                 'switchable',
  'undercabinet':               'undercabinet',
  'vanities':                   'vanities',
}

const STEALTH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

**Step 2: Add types**

```typescript
interface AcuityCSCrawlEntry {
  url: string
  rootSlug: string
  subcategorySlug: string
  subcategoryName: string
  subcategorySourceUrl: string
}

export interface AcuityCsProduct {
  productId: string
  catalogNumber: string
  displayName: string
  familyName?: string
  brandName?: string
  productPageUrl: string
  rawSpecs: Record<string, string>
  specs: Record<string, unknown>
  provenance: Record<string, unknown>
  overallConfidence: number
  crawlEvidence: CrawlEvidence
  specSheetPath?: string
  specSheetUrl?: string
  specSheets?: Array<{ label: string; url: string; path?: string }>
  configOptions?: Record<string, string[]> | null
  rootCategorySlug?: string
  categoryFamilySlug?: string
  categoryFamilyName?: string
  categoryFamilySourceUrl?: string
}
```

**Step 3: Copy helper functions from `acuity.ts` verbatim**

Copy these functions exactly as-is from `lib/crawler/acuity.ts`:
- `dismissCookieBanner(page)`
- `downloadValidPdf(url, request?)`
- `downloadImageBuffer(url, redirects?)`
- `parseAcuitySpecs(rawSpecs)` — identical spec table mapping, no changes needed

**Step 4: Add CS-specific category discovery**

This replaces `discoverSubcategoriesFromLandingPage` from `acuity.ts`. The CS landing page tiles link to Coveo product listing pages. We navigate the CS landing page and extract those tile links:

```typescript
async function discoverCSCategoryPages(
  context: BrowserContext,
  rootCategoriesToCrawl: string[]
): Promise<Array<{ slug: string; name: string; url: string }>> {
  const page = await context.newPage()
  const results: Array<{ slug: string; name: string; url: string }> = []

  try {
    console.log(`[AcuityCS] Loading CS landing page: ${CS_LANDING_URL}`)
    await page.goto(CS_LANDING_URL, { waitUntil: 'load', timeout: 45000 })
    await dismissCookieBanner(page)
    await page.waitForSelector('a[href*="/products/"]', { timeout: 15000 }).catch(() => {})
    await delay(4000)

    // Extract all /products/ links from the CS landing page
    const links = await page.evaluate(() => {
      const seen = new Set<string>()
      const found: Array<{ href: string; text: string }> = []
      document.querySelectorAll('a[href]').forEach((el) => {
        const a = el as HTMLAnchorElement
        const href = a.getAttribute('href') || ''
        const full = href.startsWith('http') ? href : `https://www.acuitybrands.com${href}`
        try {
          const u = new URL(full)
          if (u.hostname !== 'www.acuitybrands.com') return
          if (!u.pathname.startsWith('/products/')) return
          if (u.pathname.includes('/detail/')) return
          if (seen.has(full)) return
          seen.add(full)
          const text = (a.textContent || '').trim()
          found.push({ href: full, text })
        } catch { /* skip */ }
      })
      return found
    })

    console.log(`[AcuityCS] Found ${links.length} /products/ links on CS landing page`)

    // Map discovered links to our category slugs by keyword matching
    const SLUG_KEYWORDS: Record<string, string[]> = {
      'downlights':                  ['downlight'],
      'panels-troffers-wraparounds': ['troffer', 'panel', 'wrap'],
      'highbay-strip':               ['high', 'bay', 'strip', 'highbay'],
      'outdoor':                     ['outdoor'],
      'controls':                    ['control'],
      'emergency-exit':              ['emergency', 'exit'],
      'programmable-drivers':        ['driver', 'programmable'],
      'surface-flush-mount':         ['surface', 'flush'],
      'switchable':                  ['switch'],
      'undercabinet':                ['cabinet', 'under'],
      'vanities':                    ['vanit'],
    }

    for (const [slug, keywords] of Object.entries(SLUG_KEYWORDS)) {
      if (!rootCategoriesToCrawl.includes(slug)) continue

      // Find a link whose URL path or text matches any keyword for this slug
      const match = links.find(({ href, text }) => {
        const target = (href + ' ' + text).toLowerCase()
        return keywords.some(kw => target.includes(kw))
      })

      if (match) {
        const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        results.push({ slug, name, url: match.href })
        console.log(`[AcuityCS]   ${slug} → ${match.href}`)
      } else {
        console.warn(`[AcuityCS]   No link found for category: ${slug}`)
      }
    }
  } catch (err) {
    console.error(`[AcuityCS] Failed to load CS landing page:`, err)
  } finally {
    await page.close()
  }

  return results
}
```

**Step 5: Add product URL collector (copy from `acuity.ts`)**

Copy `collectProductUrlsFromSubcategoryPage` verbatim from `acuity.ts` — no changes needed, it looks for `a[href*="/products/detail/"]` which works the same on CS listing pages.

**Step 6: Add per-product extractor (copy from `acuity.ts`)**

Copy `extractProductFromPage` verbatim from `acuity.ts`. Change only:
- The function signature: takes `AcuityCSCrawlEntry` instead of `AcuityCrawlEntry`
- Spec sheet save namespace: `saveSpecSheet('acuity-cs', productId, ...)` instead of `'acuity'`
- Cache lookup: `getSpecSheetPath('acuity-cs', productId)` instead of `'acuity'`
- Thumbnail: `getThumbnailPath('acuity-cs', productId)` instead of `'acuity'`
- Return type: `AcuityCsProduct` instead of `AcuityProduct`

**Step 7: Add main crawl entry point**

```typescript
export async function crawlAcuityCS(
  rootCategoriesToCrawl: string[] = Object.keys(ACUITY_CS_ROOT_CATEGORY_PATHS)
): Promise<AcuityCsProduct[]> {
  console.log('[AcuityCS Crawler] Starting...')
  console.log(`[AcuityCS Crawler] Categories: ${rootCategoriesToCrawl.join(', ')}`)

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  })

  const context = await browser.newContext({
    userAgent: STEALTH_UA,
    viewport: { width: 1366, height: 768 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    // @ts-ignore
    if (!window.chrome) window.chrome = { runtime: {}, app: {} }
  })

  try {
    const allEntries: AcuityCSCrawlEntry[] = []
    const seenUrls = new Set<string>()

    // Step 1: Discover CS category pages from landing page
    const categories = await discoverCSCategoryPages(context, rootCategoriesToCrawl)

    if (categories.length === 0) {
      console.warn('[AcuityCS] No category pages discovered — check CS landing page structure')
      return []
    }

    // Step 2: Collect product URLs from each category page
    const listPage = await context.newPage()
    for (const cat of categories) {
      const productUrls = await collectProductUrlsFromSubcategoryPage(listPage, cat.url)
      let added = 0
      for (const url of productUrls) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url)
          allEntries.push({
            url,
            rootSlug: cat.slug,
            subcategorySlug: cat.slug,
            subcategoryName: cat.name,
            subcategorySourceUrl: cat.url,
          })
          added++
        }
      }
      console.log(`[AcuityCS] ${cat.slug}: ${added} unique products queued`)
      await delay(1000)
    }
    await listPage.close()

    if (allEntries.length === 0) {
      console.warn('[AcuityCS] No product URLs found')
      return []
    }

    console.log(`\n[AcuityCS] Processing ${allEntries.length} products (concurrency=3)...`)
    const results: AcuityCsProduct[] = []
    let completed = 0
    const limit = pLimit(3)

    await Promise.all(
      allEntries.map((entry) =>
        limit(async () => {
          await delay(1000)
          const product = await extractProductFromPage(context, entry)
          completed++
          console.log(`[${completed}/${allEntries.length}] ${entry.url}`)
          if (product) results.push(product)
        })
      )
    )

    const pdfCount = results.filter((r) => r.crawlEvidence.pdfDownloadSuccess).length
    console.log(`\n[AcuityCS] Done. ${results.length} products | ${pdfCount} with PDFs`)
    return results
  } finally {
    await context.close()
    await browser.close()
  }
}
```

**Step 8: TypeScript check**

```bash
cd /Users/tylergilstrap/Desktop/atlantiskb-lighting
npx tsc --noEmit
```

Expected: no errors. Fix any type mismatches (usually the `AcuityCSCrawlEntry` vs `AcuityCrawlEntry` type in `extractProductFromPage` parameter).

**Step 9: Commit**

```bash
git add lib/crawler/acuity-cs.ts
git commit -m "feat: add Acuity Contractor Select crawler"
```

---

## Task 3: Wire `acuity-cs` into `scripts/crawl.ts`

**Files:**
- Modify: `scripts/crawl.ts`

**Step 1: Add imports at the top**

After the existing `crawlLutron` import line, add:

```typescript
import { crawlAcuityCS, AcuityCsProduct, ACUITY_CS_ROOT_CATEGORY_PATHS } from '../lib/crawler/acuity-cs'
```

**Step 2: Add acuity-cs to defaultCategories resolution**

Find the `defaultCategories` block (around line 33). Add the `acuity-cs` arm:

```typescript
const defaultCategories = manufacturer === 'acuity'
  ? Object.keys(ACUITY_ROOT_CATEGORY_PATHS)
  : manufacturer === 'acuity-cs'
    ? Object.keys(ACUITY_CS_ROOT_CATEGORY_PATHS)
    : manufacturer === 'cooper'
      ? Object.keys(COOPER_ROOT_CATEGORY_PATHS)
      : manufacturer === 'current'
        ? Object.keys(CURRENT_ROOT_CATEGORY_PATHS)
        : manufacturer === 'lutron'
          ? Object.keys(LUTRON_ROOT_CATEGORY_PATHS)
          : Object.keys(ELITE_ROOT_CATEGORY_PATHS)
```

**Step 3: Update the union type for `products`**

Find line ~155 where `products` is typed. Add `AcuityCsProduct`:

```typescript
let products: (EliteProduct | AcuityProduct | AcuityCsProduct | CooperProduct | CurrentProduct | LutronProduct)[]
```

**Step 4: Add acuity-cs crawl branch**

In the `if/else if` chain around line 156-166, add before the `else`:

```typescript
} else if (manufacturer === 'acuity-cs') {
  products = await crawlAcuityCS(categories)
```

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 6: Smoke test (dry run — discovery only)**

Run just category discovery to confirm the landing page parses without crawling all products:

```bash
npm run crawl -- --manufacturer=acuity-cs --categories=downlights
```

Expected: `[AcuityCS] Found N /products/ links on CS landing page`, then product URLs discovered, then products processing. Kill with Ctrl+C after ~5 products to confirm it's working without running the full crawl.

**Step 7: Commit**

```bash
git add scripts/crawl.ts
git commit -m "feat: wire acuity-cs manufacturer into crawl script"
```

---

## Task 4: Cross-Reference BUDGET_ALTERNATIVE Override

**Files:**
- Modify: `lib/cross-reference.ts`

**Step 1: Find the matchType assignment**

Locate the line (around line 434) that reads:

```typescript
const matchType = determineMatchType(score, source, target)
```

**Step 2: Replace with acuity-cs override**

```typescript
// Force BUDGET_ALTERNATIVE for Contractor Select products — they are
// value-engineered alternatives regardless of spec similarity score.
const matchType = target.manufacturer.slug === 'acuity-cs'
  ? MatchType.BUDGET_ALTERNATIVE
  : determineMatchType(score, source, target)
```

Also update `matchReason` to mention the CS origin. Find where `matchReason` is built (it will be nearby) and ensure the reasons array includes a note when it's CS. Look for a `reasons.join` or similar — prepend:

```typescript
const matchReasonParts = target.manufacturer.slug === 'acuity-cs'
  ? ['Acuity Contractor Select value-engineered alternative', ...reasons]
  : reasons
```

Then use `matchReasonParts.join('; ')` wherever `reasons` was used for `matchReason`.

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add lib/cross-reference.ts
git commit -m "feat: force BUDGET_ALTERNATIVE match type for acuity-cs cross-references"
```

---

## Task 5: Full Crawl Run

**Step 1: Run the full CS crawl**

```bash
npm run crawl -- --manufacturer=acuity-cs
```

Expected output pattern:
```
[AcuityCS] Found N /products/ links on CS landing page
[AcuityCS]   downlights → https://www.acuitybrands.com/products/...
...
[AcuityCS] Processing NNN products (concurrency=3)...
[1/NNN] https://www.acuitybrands.com/products/detail/...
...
[AcuityCS] Done. NNN products | N with PDFs
=== Crawl Complete ===
```

**Step 2: Verify in Prisma Studio**

```bash
npm run db:studio
```

Check:
- `Product` table: rows with `manufacturerId` = acuity-cs ID
- `Category` table: subcategories under acuity-cs root categories
- `CrawlLog` table: status `COMPLETED` for acuity-cs manufacturer

**Step 3: Verify cross-reference tagging**

Open the app at `http://localhost:3000`. Find an Elite or standard Acuity product and run cross-reference. Confirm any `acuity-cs` matches show `matchType: BUDGET_ALTERNATIVE`.

---

## Troubleshooting

**CS landing page finds 0 category links:**
The page may require a different wait condition. Open Playwright inspector to debug:
```bash
PWDEBUG=1 npm run crawl -- --manufacturer=acuity-cs --categories=downlights
```
Inspect what URLs are present on the CS landing page and adjust `SLUG_KEYWORDS` in `discoverCSCategoryPages`.

**Products found but 0 spec sheets:**
CS products may use a different spec sheet asset URL pattern than standard Acuity. Check `pageData.specSheetLinks` in the extractor — the CS pages might use `DOC_Type=INSTALL_GUIDE` or similar instead of `SPEC_SHEET`. Log `specSheetLinks` for the first product and adjust the selector.

**TypeScript errors on `AcuityCsProduct` in `upsertProduct`:**
`upsertProduct` in `crawl.ts` accepts `EliteProduct` but reads `p.specs`, `p.rootCategorySlug`, etc. by field name. Since `AcuityCsProduct` uses identical field names (by design), the cast `p as EliteProduct` on line ~171 should work. If not, add `AcuityCsProduct` to the union type of the `upsertProduct` parameter.
