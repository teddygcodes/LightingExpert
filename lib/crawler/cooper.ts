import { chromium, BrowserContext, Page } from 'playwright'
import https from 'https'
import http from 'http'
import path from 'path'
import pLimit from 'p-limit'
import { extractByRegex, extractByAI, computeOverallConfidence } from './parser'
import type { RawSpecs } from './parser'
import { normalizeVoltage, normalizeDimmingTypes, normalizeMountingTypes } from './normalize'
import { saveSpecSheet, getSpecSheetPath } from '../storage'
import { getThumbnailPath } from '../thumbnails'
import type { CrawlEvidence, FieldProvenanceMap } from '../types'
import fs from 'fs'

const BASE_URL = 'https://www.cooperlighting.com'
const STEALTH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// ─── Category Path Mapping ─────────────────────────────────────────────────────
// Maps our seeded Category.slug → the product-list base URL.
// Hash codes for each subcategory are hardcoded in COOPER_SUBCATEGORIES below.
// These were verified by inspecting the nav dropdown links on cooperlighting.com.

// outdoor → controls → indoor ordering matters: leaf subcategories must claim
// products before the indoor all-indoor catch-all sweeps the full catalog.
export const COOPER_ROOT_CATEGORY_PATHS: Record<string, string> = {
  outdoor:  '/global/product-list',
  controls: '/global/product-list',
  indoor:   '/global/product-list',
}

// Subcategories as confirmed from nav dropdown href attributes.
// hashCode is the value after '#c=' in the product-list URL.
//
// IMPORTANT — Cooper's search API does NOT filter hierarchically for parent-level
// category codes: both product-category/indoor AND product-category/outdoor return
// the full 1,206-product catalog. Only leaf-level codes (e.g. /indoor/downlights)
// filter correctly. Therefore:
//   • Leaf subcategories are crawled first (outdoor → controls → indoor) so each
//     product is assigned to its most specific matching category via first-seen dedup.
//   • The final 'all-indoor' entry uses the indoor parent code as a catch-all for
//     any products not covered by a leaf subcategory; it runs last intentionally.
//   • Do NOT add all-outdoor / all-controls — they duplicate the full catalog.
//
// crawlCooper() processes root categories in this order:
//   outdoor → controls → indoor
// so that outdoor and controls products are claimed before the all-indoor sweep.
const COOPER_SUBCATEGORIES: Record<string, Array<{ slug: string; name: string; hashCode: string }>> = {
  outdoor: [
    { slug: 'architectural-decorative', name: 'Architectural/Decorative',  hashCode: 'cooper-lighting:product-category/outdoor/architectural-decorative' },
    { slug: 'area-site',                name: 'Area & Site',               hashCode: 'cooper-lighting:product-category/outdoor/area-site' },
    { slug: 'floodlighting',            name: 'Floodlighting',             hashCode: 'cooper-lighting:product-category/outdoor/floodlighting' },
    { slug: 'garage-canopy-tunnel',     name: 'Garage, Canopy & Tunnel',   hashCode: 'cooper-lighting:product-category/outdoor/garage-canopy-tunnel' },
    { slug: 'landscape-bollards',       name: 'Landscape & Bollards',      hashCode: 'cooper-lighting:product-category/outdoor/landscape-bollards' },
    { slug: 'poles-brackets',           name: 'Poles & Brackets',          hashCode: 'cooper-lighting:product-category/outdoor/poles-brackets' },
    { slug: 'roadway',                  name: 'Roadway',                   hashCode: 'cooper-lighting:product-category/outdoor/roadway' },
    { slug: 'sports-lighting',          name: 'Sports Lighting',           hashCode: 'cooper-lighting:product-category/outdoor/sports-lighting' },
    { slug: 'wall-mount',               name: 'Wall Mount',                hashCode: 'cooper-lighting:product-category/outdoor/wall-mount' },
  ],
  controls: [
    { slug: 'occupancy-sensors', name: 'Sensors', hashCode: 'cooper-lighting:product-category/controls-wiring/occupancy-vacancy-sensors' },
    // Note: controls parent is NOT used as catch-all (returns full catalog — same as indoor parent).
    // The occupancy-sensors leaf is the only correctly-scoped controls filter available.
  ],
  indoor: [
    { slug: 'architectural',     name: 'Architectural',           hashCode: 'cooper-lighting:product-category/indoor/architectural' },
    { slug: 'downlights',        name: 'Downlights',              hashCode: 'cooper-lighting:product-category/indoor/downlights' },
    { slug: 'exit-emergency',    name: 'Exit & Emergency',        hashCode: 'cooper-lighting:product-category/indoor/exit-emergency' },
    { slug: 'industrial',        name: 'Industrial',              hashCode: 'cooper-lighting:product-category/indoor/industrial' },
    { slug: 'linear',            name: 'Linear',                  hashCode: 'cooper-lighting:product-category/indoor/linear' },
    { slug: 'sports-lighting',   name: 'Sports Lighting',         hashCode: 'cooper-lighting:product-category/indoor/sports-lighting' },
    { slug: 'track-lighting',    name: 'Track Lighting',          hashCode: 'cooper-lighting:product-category/indoor/track-lighting' },
    { slug: 'troffers-panels',   name: 'Troffers & Panels',       hashCode: 'cooper-lighting:product-category/indoor/troffers-panels' },
    { slug: 'guv-disinfection',  name: 'UV-C / GUV Disinfection', hashCode: 'cooper-lighting:product-category/indoor/guv-disinfection' },
    // Modular Wiring Systems is a brand, not a product-category; use brand hash.
    { slug: 'modular-wiring',    name: 'Modular Wiring Systems',  hashCode: 'cooper-lighting:brands/mws' },
    // Full-catalog catch-all (indoor parent = all 1,206 products). Runs last so
    // outdoor/controls products are already claimed and won't be re-assigned here.
    { slug: 'all-indoor',        name: 'All Indoor',              hashCode: 'cooper-lighting:product-category/indoor' },
  ],
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CooperCrawlEntry {
  url: string
  thumbnailUrl?: string   // pre-fetched from search API response (saves a product page visit for thumbnail)
  rootSlug: string
  subcategorySlug: string
  subcategoryName: string
  subcategorySourceUrl: string
}

// Mirrors AcuityProduct field names so upsertProduct() in crawl.ts works unchanged.
export interface CooperProduct {
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Cookie Banner ────────────────────────────────────────────────────────────

async function dismissCookieBanner(page: Page): Promise<void> {
  const selectors = [
    'button[title="Agree and proceed"]',
    'button.agree-proceed',
    '#onetrust-accept-btn-handler',
    '.optanon-allow-all',
    'button[id*="accept-all"]',
    'button[class*="accept-all"]',
    '[aria-label*="Accept all"]',
  ]
  for (const sel of selectors) {
    try {
      const btn = await page.$(sel)
      if (btn) {
        await btn.click()
        await delay(800)
        return
      }
    } catch { /* ignore */ }
  }
  // Try trustarc iframe dismiss
  try {
    const frame = page.frames().find(f => f.url().includes('consent') || f.url().includes('trustarc'))
    if (frame) {
      const agreeBtn = await frame.$('button.agree-btn, button[title="Agree"]')
      if (agreeBtn) { await agreeBtn.click(); await delay(800) }
    }
  } catch { /* ignore */ }
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

interface PdfResult { buffer: Buffer; resolvedUrl: string; filename: string }

async function downloadValidPdf(url: string): Promise<PdfResult | null> {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`
  return new Promise((resolve) => {
    const protocol = fullUrl.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(fullUrl, {
      headers: {
        'User-Agent': STEALTH_UA,
        'Accept': 'application/pdf,*/*',
        'Referer': 'https://www.cooperlighting.com/',
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        res.resume()
        if (loc) {
          resolve(downloadValidPdf(loc.startsWith('http') ? loc : `${BASE_URL}${loc}`))
        } else {
          resolve(null)
        }
        return
      }
      if (res.statusCode !== 200) { res.resume(); resolve(null); return }
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        if (buf.length < 1000 || buf.slice(0, 4).toString('ascii') !== '%PDF') {
          resolve(null); return
        }
        try {
          const filename = path.basename(new URL(fullUrl).pathname).replace(/\.pdf$/i, '')
          resolve({ buffer: buf, resolvedUrl: fullUrl, filename })
        } catch {
          resolve({ buffer: buf, resolvedUrl: fullUrl, filename: '' })
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(25000, () => { req.destroy(); resolve(null) })
  })
}

function downloadImageBuffer(url: string, redirects = 0): Promise<Buffer | null> {
  if (redirects > 3) return Promise.resolve(null)
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`
  return new Promise((resolve) => {
    const protocol = fullUrl.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(fullUrl, { headers: { 'User-Agent': STEALTH_UA } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        res.resume()
        resolve(loc ? downloadImageBuffer(loc.startsWith('http') ? loc : `${BASE_URL}${loc}`, redirects + 1) : null)
        return
      }
      if (res.statusCode !== 200) { res.resume(); resolve(null); return }
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve(buf.length > 500 ? buf : null)
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(10000, () => { req.destroy(); resolve(null) })
  })
}

// ─── Product URL Collection via Search API ────────────────────────────────────
//
// Cooper's product-list SPA calls this REST API with page-based pagination.
// Calling it directly from Node.js (no CORS restrictions) is faster and 100%
// reliable vs. trying to drive infinite-scroll via Playwright.
//
// API: https://api.webcontent.signify.com/product-search/api/v1/search/products/CLS/en_AA
//   ?filters[]={hashCode}&page={N}&sort=newest&resultSize=24&excludedMarketingStatus=Discontinued

const SEARCH_API = 'https://api.webcontent.signify.com/product-search/api/v1/search/products/CLS/en_AA'

interface SearchApiProduct {
  ctn: string
  name: string
  link: string
  images: Array<{ path: string; alt: string }>
}

interface SearchApiResponse {
  totals: number
  maxProductsPerPage: number
  page: { currentPage: number; totalPages: number }
  products: SearchApiProduct[]
}

function fetchSearchPage(hashCode: string, pageNum: number): Promise<SearchApiResponse> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams()
    params.append('filters[]', hashCode)
    params.set('page', String(pageNum))
    params.set('sort', 'newest')
    params.set('resultSize', '24')
    params.set('excludedMarketingStatus', 'Discontinued')
    const url = `${SEARCH_API}?${params.toString()}`
    const chunks: Buffer[] = []
    const req = https.get(url, {
      headers: {
        'User-Agent': STEALTH_UA,
        'Accept': 'application/json',
        'Referer': 'https://www.cooperlighting.com/',
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`Search API returned ${res.statusCode} for ${hashCode} page ${pageNum}`))
        return
      }
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Search API timeout')) })
  })
}

async function fetchProductEntriesFromApi(
  hashCode: string
): Promise<Array<{ url: string; thumbnailUrl?: string }>> {
  const first = await fetchSearchPage(hashCode, 1)
  const all: SearchApiProduct[] = [...first.products]

  // Fetch remaining pages sequentially (polite: 200ms between pages)
  for (let p = 2; p <= first.page.totalPages; p++) {
    await delay(200)
    const page = await fetchSearchPage(hashCode, p)
    all.push(...page.products)
  }

  console.log(`[Cooper]   ${hashCode}: ${first.totals} products (${first.page.totalPages} pages)`)

  return all.map((p) => ({
    url: p.link,
    thumbnailUrl: p.images?.[0]?.path
      ? `${p.images[0].path}?wid=400&hei=400&qlt=85`
      : undefined,
  }))
}

// ─── Spec Parsing (Structured Table → RawSpecs) ───────────────────────────────

// Parses the catalog number table rows on Cooper product pages into a normalized
// key/value map. Used to get high-confidence wattage, voltage, and mounting data
// from the structured table before the regex pass on free-text bullet content.
function parseCooperTableSpecs(
  tableRows: Array<{ catalogNumber: string; lampType: string; mounting: string; voltage: string; wattage: string }>
): { specs: Partial<RawSpecs>; provenance: FieldProvenanceMap } {
  const specs: Partial<RawSpecs> = {}
  const provenance: FieldProvenanceMap = {}

  if (tableRows.length === 0) return { specs, provenance }

  function fp(rawValue: string) {
    return { source: 'REGEX' as const, confidence: 0.95, rawValue }
  }

  // Wattage: collect all values, derive min/max or single
  const wattages = tableRows
    .map(r => parseFloat(r.wattage))
    .filter(n => !isNaN(n) && n > 0)

  if (wattages.length === 1) {
    specs.wattage = wattages[0]
    provenance.wattage = fp(tableRows[0].wattage)
  } else if (wattages.length > 1) {
    specs.wattageMin = Math.min(...wattages)
    specs.wattageMax = Math.max(...wattages)
    provenance.wattageMin = fp(String(specs.wattageMin))
    provenance.wattageMax = fp(String(specs.wattageMax))
  }

  // Voltage: all rows should have the same voltage; take first unique
  const voltageRaw = tableRows[0].voltage
  if (voltageRaw) {
    specs.voltage = voltageRaw.trim()
    provenance.voltage = fp(voltageRaw)
  }

  // Mounting: collect unique mounting types from all rows
  const mountings = [...new Set(tableRows.map(r => r.mounting).filter(Boolean))]
  if (mountings.length > 0) {
    specs.mountingType = mountings.join(', ')
    provenance.mountingType = fp(mountings.join(', '))
  }

  // Dimming: from lampType or mounting (Cooper sometimes puts "Dimming" info there)
  const combinedText = tableRows.map(r => `${r.lampType} ${r.mounting}`).join(' ')
  if (/dim/i.test(combinedText)) {
    const types = normalizeDimmingTypes(combinedText)
    if (types.length > 0) {
      specs.dimmable = true
      specs.dimmingType = combinedText.trim()
      provenance.dimmable = fp(combinedText)
      provenance.dimmingType = fp(combinedText)
    }
  }

  return { specs, provenance }
}

// ─── Per-Product Extraction ───────────────────────────────────────────────────

async function extractProductFromPage(
  context: BrowserContext,
  entry: CooperCrawlEntry
): Promise<CooperProduct | null> {
  const page = await context.newPage()
  const evidence: CrawlEvidence = {
    pageUrl: entry.url,
    errors: [],
    attemptedPdfUrls: [],
  }

  try {
    await page.goto(entry.url, { waitUntil: 'load', timeout: 45000 })
    await dismissCookieBanner(page)
    await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {})
    await delay(1500)

    // Extract static page data via page.evaluate
    const pageData = await page.evaluate(() => {
      // Title
      const h1 = document.querySelector('h1')?.textContent?.trim() || ''

      // Brand: look for brand logo img alt text in the product header area
      let brandName = ''
      const brandImgs = document.querySelectorAll('img[alt]')
      brandImgs.forEach((img) => {
        if (brandName) return
        const alt = (img as HTMLImageElement).alt?.trim() || ''
        const src = (img as HTMLImageElement).src || ''
        // Cooper brand logos are typically in the product detail header area
        if (alt && alt.length > 0 && alt.length < 50 && !alt.toLowerCase().includes('lighting solutions')
          && (src.includes('/brands/') || src.includes('brand') || src.includes('logo'))) {
          brandName = alt
        }
      })

      // Feature bullets: the main spec description is in a <ul><li> list
      const bulletTexts: string[] = []
      document.querySelectorAll('li').forEach((li) => {
        const text = li.textContent?.trim() || ''
        // Skip nav/footer items — real spec bullets are 20-300 chars and contain numbers or keywords
        if (text.length > 15 && text.length < 400 && !text.includes('©') && !text.includes('Cookie')) {
          bulletTexts.push(text)
        }
      })

      // Hero image: first product image from the carousel or main product area
      let heroImageUrl = ''
      const productImgs = document.querySelectorAll('img[alt]')
      productImgs.forEach((img) => {
        if (heroImageUrl) return
        const src = (img as HTMLImageElement).src || ''
        const alt = (img as HTMLImageElement).alt?.trim() || ''
        if (src.includes('assets.cooperlighting.com') && alt && !alt.toLowerCase().includes('logo')) {
          // Request a larger version from the CDN
          heroImageUrl = src.replace(/\?.*$/, '?wid=800&hei=800&qlt=85')
        }
      })

      // Spec sheet PDF links from the Resources section
      // Cooper uses /api/assets/v1/file/CLS/content/{folder}/{filename}.pdf
      const specSheetLinks: Array<{ label: string; url: string }> = []
      const seenUrls = new Set<string>()
      document.querySelectorAll('a[href*="/api/assets/v1/file/"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href
        const lowerHref = href.toLowerCase()
        // Only PDFs; skip IES, zip, images, instruction sheets
        if (!lowerHref.endsWith('.pdf')) return
        // Prefer spec sheets; skip instruction sheets and selection guides as primary
        if (seenUrls.has(href)) return
        seenUrls.add(href)
        const text = a.textContent?.trim() || ''
        const nearLabel = a.closest('[class*="resource"], [class*="document"], li')?.querySelector('a')?.textContent?.trim() || text
        specSheetLinks.push({ label: nearLabel || 'Spec Sheet', url: href })
      })

      // Re-order: put "Spec Sheets" section items first
      const specFirst = specSheetLinks.filter(s =>
        s.label.toLowerCase().includes('spec') || s.url.toLowerCase().includes('spec')
      )
      const rest = specSheetLinks.filter(s =>
        !s.label.toLowerCase().includes('spec') && !s.url.toLowerCase().includes('spec')
      )
      const orderedSpecSheets = [...specFirst, ...rest]

      // Catalog number table rows (Stock Catalog Number section)
      const tableRows: Array<{
        catalogNumber: string
        lampType: string
        mounting: string
        voltage: string
        wattage: string
      }> = []
      // Each row in the catalog table has cells: [catalog#, lampType, mounting, voltage, wattage, specLink]
      document.querySelectorAll('[class*="stock"] tr, [class*="catalog"] tr, [class*="configure"] tr, [class*="product-list-table"] tr, [class*="row--"]').forEach((row) => {
        const cells = row.querySelectorAll('td, [class*="cell"]')
        if (cells.length >= 4) {
          const catalogNumber = cells[0].textContent?.trim() || ''
          const lampType = cells[1].textContent?.trim() || ''
          const mounting = cells[2].textContent?.trim() || ''
          const voltage = cells[3].textContent?.trim() || ''
          const wattage = cells.length >= 5 ? cells[4].textContent?.trim() || '' : ''
          // Only add rows that look like catalog number rows (catalog numbers are alphanumeric, uppercase)
          if (catalogNumber && /^[A-Z0-9][A-Z0-9-]{2,}/.test(catalogNumber)) {
            tableRows.push({ catalogNumber, lampType, mounting, voltage, wattage })
          }
        }
      })

      // Also try to find catalog numbers from the individual spec links
      // e.g.: /api/assets/v1/file/CLS/content/halo-hlc-specsheet/halo-hlc-specsheet_hlc4fs1e-24p.pdf
      const catalogFromSpecLinks: string[] = []
      document.querySelectorAll('a[href*="/api/assets/v1/file/"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href
        const text = a.textContent?.trim() || ''
        if (text.length > 2 && text.length < 30 && text === text.toUpperCase() && /\d/.test(text)) {
          catalogFromSpecLinks.push(text)
        }
      })

      return {
        h1,
        brandName,
        bulletTexts,
        heroImageUrl,
        specSheetLinks: orderedSpecSheets,
        tableRows,
        catalogFromSpecLinks,
      }
    })

    evidence.pageTitle = pageData.h1

    // ── Determine catalog number ──────────────────────────────────────────────
    // Priority: first table row catalog number > first spec link catalog number > URL numeric ID
    let catalogNumber =
      pageData.tableRows[0]?.catalogNumber
      ?? pageData.catalogFromSpecLinks[0]
      ?? null

    if (!catalogNumber) {
      // Fall back to the numeric product ID from the URL
      const idMatch = entry.url.match(/\/global\/brands\/[^/]+\/(\d+)\//)
      catalogNumber = idMatch ? `COOPER-${idMatch[1]}` : `COOPER-${Date.now()}`
    }

    evidence.crawlCatalogCandidate = catalogNumber

    // ── Spec Extraction ───────────────────────────────────────────────────────
    // Step 1: Parse structured catalog table → high-confidence fields
    const { specs: tableSpecs, provenance: tableProvenance } = parseCooperTableSpecs(pageData.tableRows)

    // Step 2: Regex pass over bullet list + page text
    const bulletText = pageData.bulletTexts.join(' | ')
    const { specs: regexSpecs, provenance: regexProvenance } = extractByRegex(bulletText)

    // Merge: table specs override regex specs for fields they provide (higher confidence)
    const mergedSpecs: Record<string, unknown> = { ...regexSpecs, ...tableSpecs } as Record<string, unknown>
    const mergedProvenance: FieldProvenanceMap = { ...regexProvenance, ...tableProvenance }

    // Build rawSpecs for AI fallback (key: value string pairs)
    const rawSpecs: Record<string, string> = {
      bulletText,
      ...pageData.tableRows.reduce((acc, row, i) => ({
        ...acc,
        [`SKU_${i + 1}`]: `${row.catalogNumber} | ${row.lampType} | ${row.mounting} | ${row.voltage} | ${row.wattage}`,
      }), {} as Record<string, string>),
    }

    const regexConfidence = computeOverallConfidence(mergedProvenance)
    evidence.extractionConfidence = regexConfidence

    let finalSpecs = mergedSpecs
    let finalProvenance = mergedProvenance

    // Step 3: AI fallback for low-confidence extractions
    if (regexConfidence < 0.5) {
      console.log(`  [AI] Low confidence (${regexConfidence.toFixed(2)}) for ${catalogNumber}, running AI fallback...`)
      const specText = [bulletText, ...pageData.tableRows.map(r =>
        `${r.catalogNumber}: ${r.wattage}W, ${r.voltage}, ${r.mounting}`
      )].join('\n').slice(0, 4000)
      const { specs: aiSpecs, provenance: aiProvenance } = await extractByAI(
        specText,
        mergedSpecs as Partial<RawSpecs>,
        mergedProvenance
      )
      finalSpecs = aiSpecs as Record<string, unknown>
      finalProvenance = aiProvenance
    }

    const overallConfidence = computeOverallConfidence(finalProvenance)

    // ── Spec Sheet PDF ─────────────────────────────────────────────────────────
    let specSheetPath: string | undefined
    let resolvedSpecSheetUrl: string | undefined

    const primaryLink = pageData.specSheetLinks[0] ?? null
    const cachedPath = getSpecSheetPath('cooper', catalogNumber)
    if (cachedPath) {
      specSheetPath = cachedPath
      evidence.pdfDownloadSuccess = true
      evidence.discoveredPdfUrl = 'cached'
    } else if (primaryLink) {
      evidence.attemptedPdfUrls!.push(primaryLink.url)
      const pdfResult = await downloadValidPdf(primaryLink.url)
      if (pdfResult) {
        specSheetPath = saveSpecSheet('cooper', catalogNumber, pdfResult.buffer)
        resolvedSpecSheetUrl = pdfResult.resolvedUrl
        evidence.discoveredPdfUrl = pdfResult.resolvedUrl
        evidence.pdfDownloadSuccess = true
        console.log(`  [PDF] Downloaded: ${primaryLink.url}`)
      } else {
        evidence.pdfDownloadSuccess = false
        resolvedSpecSheetUrl = primaryLink.url  // preserve for backfill
        evidence.errors!.push(`PDF download failed: ${primaryLink.url}`)
        console.warn(`  [PDF] Not found for ${catalogNumber}`)
      }
    } else {
      evidence.pdfDownloadSuccess = false
      console.warn(`  [PDF] No spec sheet URL found for ${catalogNumber}`)
    }

    const specSheets = (pageData.specSheetLinks ?? []).map((s, i) => ({
      label: s.label,
      url: s.url,
      path: i === 0 ? specSheetPath : undefined,
    }))

    // ── Thumbnail ──────────────────────────────────────────────────────────────
    // Prefer the API-provided thumbnail URL; fall back to the hero image extracted from the page.
    const thumbPath = getThumbnailPath('cooper', catalogNumber)
    const thumbSrc = entry.thumbnailUrl || pageData.heroImageUrl
    if (thumbSrc && !fs.existsSync(thumbPath)) {
      const imgBuf = await downloadImageBuffer(thumbSrc)
      if (imgBuf) {
        const thumbDir = path.dirname(thumbPath)
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })
        fs.writeFileSync(thumbPath, imgBuf)
      }
    }

    evidence.parseMethod = 'html_only'
    evidence.fieldCountExtracted = Object.keys(finalProvenance).length

    const displayName = pageData.h1 || `Cooper Product ${catalogNumber}`
    const brandName = pageData.brandName || undefined

    return {
      catalogNumber,
      displayName,
      familyName: brandName,  // family = brand name for Cooper (e.g. "HALO", "Metalux")
      brandName,
      productPageUrl: entry.url,
      rawSpecs,
      specs: finalSpecs,
      provenance: finalProvenance,
      overallConfidence,
      crawlEvidence: evidence,
      specSheetPath,
      specSheetUrl: resolvedSpecSheetUrl,
      specSheets: specSheets.length > 0 ? specSheets : undefined,
      configOptions: null,
      rootCategorySlug: entry.rootSlug,
      categoryFamilySlug: entry.subcategorySlug,
      categoryFamilyName: entry.subcategoryName,
      categoryFamilySourceUrl: entry.subcategorySourceUrl,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    evidence.errors!.push(message)
    console.error(`[Cooper] Failed for ${entry.url}:`, message)
    return null
  } finally {
    await page.close()
  }
}

// ─── Main Crawl Entry Point ───────────────────────────────────────────────────

export async function crawlCooper(
  rootCategoriesToCrawl: string[] = Object.keys(COOPER_ROOT_CATEGORY_PATHS)
): Promise<CooperProduct[]> {
  console.log('[Cooper Crawler] Starting...')
  console.log(`[Cooper Crawler] Categories: ${rootCategoriesToCrawl.join(', ')}`)

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor',
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
    const allEntries: CooperCrawlEntry[] = []
    const seenUrls = new Set<string>()

    for (const rootSlug of rootCategoriesToCrawl) {
      if (!COOPER_ROOT_CATEGORY_PATHS[rootSlug]) {
        console.warn(`[Cooper] Unknown root category slug: "${rootSlug}" — skipping`)
        continue
      }

      const subcategories = COOPER_SUBCATEGORIES[rootSlug] ?? []
      if (subcategories.length === 0) {
        console.warn(`[Cooper] No subcategories defined for "${rootSlug}" — skipping`)
        continue
      }

      for (const sub of subcategories) {
        const sourceUrl = `${BASE_URL}/global/product-list#c=${sub.hashCode}`
        const apiEntries = await fetchProductEntriesFromApi(sub.hashCode)

        let addedCount = 0
        for (const { url, thumbnailUrl } of apiEntries) {
          // Normalize URL: strip any hash fragment
          let cleanUrl = url
          try { cleanUrl = new URL(url).origin + new URL(url).pathname } catch { /* keep as-is */ }
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl)
            allEntries.push({
              url: cleanUrl,
              thumbnailUrl,
              rootSlug,
              subcategorySlug: sub.slug,
              subcategoryName: sub.name,
              subcategorySourceUrl: sourceUrl,
            })
            addedCount++
          }
        }
        console.log(`[Cooper] ${rootSlug}/${sub.slug}: ${addedCount} unique products queued`)
        await delay(500)
      }
    }

    if (allEntries.length === 0) {
      console.warn('[Cooper] No product URLs found — check cooperlighting.com structure')
      return []
    }

    console.log(`\n[Cooper] Processing ${allEntries.length} products total (concurrency=3)...`)
    const results: CooperProduct[] = []
    let completed = 0
    const limit = pLimit(3)

    await Promise.all(
      allEntries.map((entry) =>
        limit(async () => {
          await delay(1000) // polite delay between requests
          const product = await extractProductFromPage(context, entry)
          completed++
          console.log(`[${completed}/${allEntries.length}] ${entry.url}`)
          if (product) results.push(product)
        })
      )
    )

    const pdfCount = results.filter((r) => r.crawlEvidence.pdfDownloadSuccess).length
    console.log(`\n[Cooper] Done. ${results.length} products | ${pdfCount} with PDFs`)
    return results
  } finally {
    await context.close()
    await browser.close()
  }
}
