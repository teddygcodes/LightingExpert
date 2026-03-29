import { chromium, Browser, Page } from 'playwright'
import * as cheerio from 'cheerio'
import https from 'https'
import http from 'http'
import path from 'path'
import pLimit from 'p-limit'
import { extractByRegex, extractByAI, extractConfigTable, computeOverallConfidence } from './parser'
import {
  normalizeVoltage,
  normalizeFormFactor,
} from './normalize'
import { saveSpecSheet, getSpecSheetPath } from '../storage'
import { getThumbnailPath } from '../thumbnails'
import type { CrawlEvidence } from '../types'
import fs from 'fs'
import { withRetryOrNull } from './retry'

const BASE_URL = 'https://iuseelite.com'
const SITEMAP_URL = 'https://iuseelite.com/sitemap.xml'
const PRODUCT_SELECTOR_URL = 'https://iuseelite.com/product-selector/'
const SPEC_SHEET_CDN = 'https://media.iuseelite.com/specsheet2'

// ─── Category path mapping ────────────────────────────────────────────────────
// Maps our seeded Category.slug → Elite's custom landing page path.
// Landing pages contain sub-category tiles that link to WooCommerce /product-category/ pages.

export const ELITE_ROOT_CATEGORY_PATHS: Record<string, string> = {
  'interior-lighting': '/interior-lighting/',
  'exterior-lighting': '/exterior-light/',
}

// Fallback WooCommerce root URLs — used when landing page has no sub-category links
const ELITE_WOO_FALLBACK_PATHS: Record<string, string> = {
  'interior-lighting': '/product-category/interior-lighting/',
  'exterior-lighting': '/product-category/exterior-light/',
}

// Hardcoded WooCommerce product-category URLs for Elite sub-families whose tiles on the
// custom landing pages (e.g. /interior-lighting/) link to non-WooCommerce marketing pages.
// The dynamic discovery regex only catches /product-category/ links from the landing page,
// so these families must be listed explicitly with their verified WooCommerce collection URLs.
//
// Verified by checking https://iuseelite.com/product-category/[slug]/ for products.
const ELITE_CUSTOM_FAMILIES: Record<string, Array<{ slug: string; name: string; url: string }>> = {
  'interior-lighting': [
    // GROOVE 48V Track System
    { slug: 'groove-blade',                   name: 'GROOVE Blade (48V)',                        url: 'https://iuseelite.com/product-category/blade/' },
    { slug: 'tension',                        name: 'GROOVE Tension (48V)',                      url: 'https://iuseelite.com/product-category/tension/' },
    // Linear Slot
    { slug: 'recessed-linear-slot',           name: 'Recessed Linear Slot',                      url: 'https://iuseelite.com/product-category/recessed-linear-slot/' },
    { slug: 'suspended-linear-slot',          name: 'Suspended Linear Slot',                     url: 'https://iuseelite.com/product-category/suspended-linear-slot/' },
    { slug: 'surface-mount-linear-slot',      name: 'Surface Mount Linear Slot',                 url: 'https://iuseelite.com/product-category/surface-mount-linear-slot/' },
    { slug: 'wall-mount-linear-slot',         name: 'Wall Mount Linear Slot',                    url: 'https://iuseelite.com/product-category/wall-mount-linear-slot/' },
    { slug: 'surface-linear',                 name: 'Surface Linear Lighting',                   url: 'https://iuseelite.com/product-category/surface-linear-lighting/' },
    // Specification Downlighting (3 distinct WooCommerce categories for accent/adjustable/wall-wash)
    { slug: 'accent-downlighting',            name: 'Accent Downlighting',                       url: 'https://iuseelite.com/product-category/accent/' },
    { slug: 'adjustable-downlighting',        name: 'Adjustable Downlighting',                   url: 'https://iuseelite.com/product-category/adjustable/' },
    { slug: 'wall-wash',                      name: 'Wall Wash Downlighting',                    url: 'https://iuseelite.com/product-category/wall-wash/' },
    { slug: 'general-purpose-downlighting',   name: 'General Purpose Downlighting',              url: 'https://iuseelite.com/product-category/general-purpose-downlighting/' },
    { slug: 'residential-downlighting',       name: 'Residential IC/Non-IC Downlighting',        url: 'https://iuseelite.com/product-category/ic-rated/' },
    // Specialty Fixtures
    { slug: 'architectural-cylinders',        name: 'Architectural Cylinders',                   url: 'https://iuseelite.com/product-category/architectural-cylinders/' },
    { slug: 'svelt',                          name: 'Svelt',                                     url: 'https://iuseelite.com/product-category/svelt/' },
    { slug: 'acoustic-products',              name: 'Acoustic Products',                         url: 'https://iuseelite.com/product-category/acoustic/' },
    // Recessed
    { slug: 'recessed-volumetric',            name: 'Recessed Volumetric',                       url: 'https://iuseelite.com/product-category/recessed-volumetric/' },
    { slug: 'troffer-parabolic',              name: 'Troffer Parabolic',                         url: 'https://iuseelite.com/product-category/troffer-parabolic/' },
    { slug: 'fire-rated',                     name: 'Fire Rated Lighting',                       url: 'https://iuseelite.com/product-category/fire-rated/' },
    // Surface & Suspended
    { slug: 'surface-troffer-parabolic',      name: 'Surface Troffer Parabolic',                 url: 'https://iuseelite.com/product-category/surface-troffer-parabolic/' },
    { slug: 'surface-wall-mount',             name: 'Surface Wall Mount',                        url: 'https://iuseelite.com/product-category/surface-wall-mount/' },
    { slug: 'surface-lighting',               name: 'Surface Lighting',                          url: 'https://iuseelite.com/product-category/surface-lighting/' },
    // General Applications
    { slug: 'high-bay-low-bay',               name: 'High Bay / Low Bay',                        url: 'https://iuseelite.com/product-category/high-bay-low-bay/' },
    { slug: 'track-lighting',                 name: 'Track Lighting',                            url: 'https://iuseelite.com/product-category/track-lighting/' },
    { slug: 'led-retrofit',                   name: 'LED Retrofit',                              url: 'https://iuseelite.com/product-category/retrofit/' },
    { slug: 'undercabinet',                   name: 'Undercabinet Lighting',                     url: 'https://iuseelite.com/product-category/undercabinet/' },
    { slug: 'vandal-resistant',               name: 'Vandal Resistant',                          url: 'https://iuseelite.com/product-category/vandal-resistant/' },
    { slug: 'exit-emergency',                 name: 'Exit & Emergency Lighting',                 url: 'https://iuseelite.com/product-category/exit-emergency-lighting/' },
    // Previously missing — behind marketing hub pages whose tiles link to non-product-category URLs
    // Flat Panel (behind /flat-panel/ hub)
    { slug: 'led-flat-panel',                            name: 'LED Flat Panel',                               url: 'https://iuseelite.com/product-category/led-flat-panel/' },
    // Micro Downlighting (behind /micro/ hub — 4 sub-families)
    { slug: 'micro-recessed-downlights',                 name: 'Micro Recessed Downlights',                    url: 'https://iuseelite.com/product-category/micro-recessed-downlights/' },
    { slug: 'micro-recessed-wall-wash',                  name: 'Micro Recessed Wall Wash',                     url: 'https://iuseelite.com/product-category/micro-recessed-wall-wash/' },
    { slug: 'micro-recessed-adjustable',                 name: 'Micro Recessed Adjustable',                    url: 'https://iuseelite.com/product-category/micro-recessed-adjustable/' },
    { slug: 'micro-trimless-recessed',                   name: 'Micro Trimless Recessed',                      url: 'https://iuseelite.com/product-category/micro-trimless-recessed/' },
    // Tape Light System (behind /tape-light-system/ hub)
    { slug: 'tapepowersupply',                           name: 'Tape Light Power Supply',                      url: 'https://iuseelite.com/product-category/tapepowersupply/' },
    // Combo & Retrofit (behind /combo-lighting/ and /led-slim-retrofit/ hubs)
    { slug: 'recessed-multi-lamp-combo-lights',          name: 'Recessed Multi-Lamp Combo Lights',             url: 'https://iuseelite.com/product-category/recessed-multi-lamp-combo-lights/' },
    { slug: 'canless-recessed',                          name: 'Canless Recessed (LED Slim Retrofit)',          url: 'https://iuseelite.com/product-category/canless-recessed/' },
    // Specification Downlighting (behind sub-landing hub pages)
    { slug: 'small-aperture-specification-downlighting', name: 'Small Aperture Specification Downlighting',    url: 'https://iuseelite.com/product-category/small-aperture-specification-downlighting/' },
    { slug: 'shallow-plenum-specification-downlighting', name: 'Shallow Plenum Specification Downlighting',    url: 'https://iuseelite.com/product-category/shallow-plenum-specification-downlighting/' },
    // Direct/Indirect (behind /direct-indirect/ hub — actual WooCommerce slug is recessed-direct-indirect)
    { slug: 'recessed-direct-indirect',                  name: 'Recessed Direct/Indirect',                     url: 'https://iuseelite.com/product-category/recessed-direct-indirect/' },
    // Small Aperture Linear Slot (behind /small-aperture-linear-slot/ hub — actual slug is omls)
    { slug: 'omls',                                      name: 'Small Aperture Linear Slot (OMLS)',             url: 'https://iuseelite.com/product-category/omls/' },
    // Soul decorative pendant family (behind /soul/ hub)
    { slug: 'soul',                                      name: 'Soul',                                         url: 'https://iuseelite.com/product-category/soul/' },
    // IP Rated / Wet Location / Food Processing (behind /ip-rated-wet-location-food-processing/ hub)
    { slug: 'ip-rated-wet-location-food-processing',    name: 'IP Rated / Wet Location / Food Processing',    url: 'https://iuseelite.com/product-category/ip-rated-wet-location-food-processing/' },
  ],

  'exterior-lighting': [
    { slug: 'bollard-lighting',         name: 'Bollards',                 url: 'https://iuseelite.com/product-category/bollard-lighting/' },
    { slug: 'outdoor-wall-packs',       name: 'Wall Packs',               url: 'https://iuseelite.com/product-category/outdoor-wall-packs-lighting/' },
    { slug: 'wall-sconce',              name: 'Wall Sconce',              url: 'https://iuseelite.com/product-category/wall-sconce/' },
    { slug: 'outdoor-cylinders',        name: 'Outdoor Cylinders',        url: 'https://iuseelite.com/product-category/outdoor-cylinders/' },
    { slug: 'area-site-lighting',       name: 'Area Lighting',            url: 'https://iuseelite.com/product-category/area-site-lighting/' },
    { slug: 'architectural-post-top',   name: 'Architectural Post Top',   url: 'https://iuseelite.com/product-category/architectural-post-top/' },
    { slug: 'sport-light',              name: 'Sport Light',              url: 'https://iuseelite.com/product-category/sport-light/' },
    { slug: 'flood-lighting',           name: 'Flood Lighting',           url: 'https://iuseelite.com/product-category/flood-lighting/' },
    { slug: 'medallion',                name: 'Medallion',                url: 'https://iuseelite.com/product-category/medallion/' },
    { slug: 'outdoor-step-lighting',    name: 'Outdoor Step Lighting',    url: 'https://iuseelite.com/product-category/outdoor-step-lighting/' },
    { slug: 'inground',                 name: 'Inground',                 url: 'https://iuseelite.com/product-category/inground/' },
    { slug: 'pillar-lighting',          name: 'Pillar Lighting',          url: 'https://iuseelite.com/product-category/pillar-lighting/' },
    { slug: 'outdoor-cove-lighting',    name: 'Outdoor Cove Lighting',    url: 'https://iuseelite.com/product-category/outdoor-cove-lighting/' },
    { slug: 'solar-light',              name: 'Solar Light',              url: 'https://iuseelite.com/product-category/solar-light/' },
    { slug: 'architectural-elements',   name: 'Architectural Elements',   url: 'https://iuseelite.com/product-category/architectural-elements/' },
    { slug: 'vaporproof',               name: 'Vaporproof',               url: 'https://iuseelite.com/product-category/vaporproof/' },
    { slug: 'parking-garage-canopy',    name: 'Parking Garage / Canopy',  url: 'https://iuseelite.com/product-category/parking-garage-canopy/' },
    { slug: 'security-light',           name: 'Security Light',           url: 'https://iuseelite.com/product-category/security-light/' },
    { slug: 'dock-light',               name: 'Dock Light',               url: 'https://iuseelite.com/product-category/dock-light/' },
    { slug: 'hanging-lanterns',         name: 'Hanging Lanterns',         url: 'https://iuseelite.com/product-category/hanging-lanterns/' },
    { slug: 'decorative-ceiling-mount', name: 'Decorative Ceiling Mount', url: 'https://iuseelite.com/product-category/decorative-ceiling-mount/' },
    { slug: 'post-lights',              name: 'Post Lights',              url: 'https://iuseelite.com/product-category/post-lights/' },
    { slug: 'decorative-wall-mount',    name: 'Decorative Wall Mount',    url: 'https://iuseelite.com/product-category/decorative-wall-mount/' },
    // Handrail Series excluded: custom /handrail-series/ page; /product-category/handrail-series/ returns 404
  ],
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Internal: product URL tagged with its category context from Elite's site
interface CrawlEntry {
  url: string
  rootSlug: string           // our DB category slug (e.g., 'interior-lighting')
  familySlug: string         // sub-category slug (e.g., 'flat-panel')
  familyName: string         // display name (e.g., 'Flat Panel')
  familySourceUrl: string    // Elite URL for this family page
}

export interface EliteProduct {
  catalogNumber: string
  crawlCatalogCandidate: string
  displayName: string
  familyName?: string         // heuristic from catalog number prefix (product display)
  productPageUrl: string
  rawText: string
  specs: Record<string, unknown>
  provenance: Record<string, unknown>
  overallConfidence: number
  crawlEvidence: CrawlEvidence
  specSheetPath?: string
  specSheetUrl?: string
  configOptions?: Record<string, string[]> | null
  // Category context — set by category-based discovery
  rootCategorySlug?: string
  categoryFamilySlug?: string
  categoryFamilyName?: string
  categoryFamilySourceUrl?: string
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Raw HTTP download — for XML/HTML content (no PDF validation)
function rawDownload(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return }
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', () => resolve(null))
    req.setTimeout(15000, () => { req.destroy(); resolve(null) })
  })
}

// PDF download with %PDF header validation as primary gate
interface PdfResult { buffer: Buffer; resolvedUrl: string; filename: string }

function downloadValidPdf(url: string): Promise<PdfResult | null> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return }
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        // %PDF header is the required gate; content-type is a supporting signal only
        if (buf.length < 1000 || buf.slice(0, 4).toString('ascii') !== '%PDF') {
          resolve(null)
          return
        }
        try {
          const filename = path.basename(new URL(url).pathname).replace(/\.pdf$/i, '')
          resolve({ buffer: buf, resolvedUrl: url, filename })
        } catch {
          resolve({ buffer: buf, resolvedUrl: url, filename: '' })
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(15000, () => { req.destroy(); resolve(null) })
  })
}

// Downloads a raw image buffer (any format) from a URL
function downloadImageBuffer(url: string, redirects = 0): Promise<Buffer | null> {
  if (redirects > 3) return Promise.resolve(null)
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        res.resume()
        resolve(loc ? downloadImageBuffer(loc.startsWith('http') ? loc : `https://iuseelite.com${loc}`, redirects + 1) : null)
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

// ─── Sitemap Discovery (kept as reference/fallback) ───────────────────────────

async function discoverProductUrlsViaSitemap(): Promise<string[]> {
  try {
    const buf = await rawDownload(SITEMAP_URL)
    if (!buf) return []
    const xml = buf.toString()
    const $ = cheerio.load(xml, { xmlMode: true })

    const sitemapUrls: string[] = []
    $('sitemap loc').each((_, el) => { sitemapUrls.push($(el).text()) })

    const productSitemaps = sitemapUrls.filter(
      (u) => u.includes('product') || u.includes('catalog')
    )

    const productUrls: string[] = []

    if (productSitemaps.length > 0) {
      for (const sitemapUrl of productSitemaps) {
        const subBuf = await rawDownload(sitemapUrl)
        if (!subBuf) continue
        const sub$ = cheerio.load(subBuf.toString(), { xmlMode: true })
        sub$('url loc').each((_, el) => {
          const url = sub$(el).text()
          if (url.includes('/products/') || url.includes('/product/')) productUrls.push(url)
          return true
        })
      }
    } else {
      $('url loc').each((_, el) => {
        const url = $(el).text()
        if (url.includes('/products/') || url.includes('/product/')) productUrls.push(url)
        return true
      })
    }

    console.log(`[Sitemap] Found ${productUrls.length} product URLs`)
    return productUrls
  } catch (err) {
    console.warn('[Sitemap] Failed:', err)
    return []
  }
}

// ─── Category-Based Discovery ─────────────────────────────────────────────────

// Paginate through a WooCommerce category/family page and collect all product URLs.
async function collectProductUrlsFromCategoryPage(page: Page, baseUrl: string): Promise<string[]> {
  const productUrls = new Set<string>()
  let pageNum = 1

  while (true) {
    const pageUrl = pageNum === 1 ? baseUrl : `${baseUrl.replace(/\/$/, '')}/page/${pageNum}/`
    try {
      const response = await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 })
      if (!response || response.status() === 404) break
      await delay(800)

      const html = await page.content()
      const $ = cheerio.load(html)

      let newFound = 0
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
        if (
          (fullUrl.includes('/products/') || fullUrl.includes('/product/')) &&
          !fullUrl.includes('/product-category/') &&
          !productUrls.has(fullUrl)
        ) {
          productUrls.add(fullUrl)
          newFound++
        }
        return true
      })

      if (newFound === 0) break   // No new products — reached the last page
      pageNum++
    } catch {
      break
    }
  }

  return [...productUrls]
}

// Navigate Elite's landing page, discover WooCommerce sub-category links, paginate each for product URLs.
// Landing pages (e.g., /interior-lighting/) contain sub-category tiles; the actual product
// listings live at /product-category/X WooCommerce pages linked from those tiles.
async function discoverProductsByCategoryPage(
  browser: Browser,
  rootSlug: string,
  landingPath: string,
  familiesToCrawl?: string[]
): Promise<CrawlEntry[]> {
  const entries: CrawlEntry[] = []
  const page = await browser.newPage()

  try {
    const landingUrl = `${BASE_URL}${landingPath}`
    console.log(`[Category] Scanning ${rootSlug}: ${landingUrl}`)
    await page.goto(landingUrl, { waitUntil: 'networkidle', timeout: 30000 })
    await delay(2000)

    const html = await page.content()
    const $ = cheerio.load(html)

    // Find WooCommerce /product-category/ links inside main content — these are the family tiles
    interface FamilyInfo { slug: string; name: string; sourceUrl: string }
    const familyMap = new Map<string, FamilyInfo>()

    $('main a[href], #content a[href], .entry-content a[href]').each((_, el) => {
      const href = $(el).attr('href')?.trim() || ''
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`

      // Must be a WooCommerce product-category URL on iuseelite.com
      if (!fullUrl.startsWith(BASE_URL)) return
      const match = fullUrl.match(/\/product-category\/([^/?# ]+)/)
      if (!match) return

      const slug = match[1].replace(/\/$/, '')
      if (familyMap.has(slug)) return

      // Manual display name overrides for tiles that contain only images (no <strong> text)
      const SLUG_NAME_OVERRIDES: Record<string, string> = {
        't-bar-led': 'T-Bar LED',
        'uvc': 'UVC',
      }

      // Try to get the display name from the tile's <strong> text.
      // The <a> link sits inside a <SPAN> inside a tile column <DIV> (fusion-layout-column).
      // closest('div') lands on that column div which already contains the tile's <strong> texts.
      const $a = $(el)
      const $tileContainer = $a.closest('div')
      const strongTexts = $tileContainer.find('strong')
        .map((_, s) => $(s).text().trim()).get().filter(Boolean)
      const name = strongTexts.length > 0
        ? strongTexts.join(' ')
        : SLUG_NAME_OVERRIDES[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      familyMap.set(slug, { slug, name, sourceUrl: `${BASE_URL}/product-category/${slug}/` })
    })

    // Merge hardcoded custom landing-page families (Elite's non-WooCommerce subcategory URLs)
    const customFamilies = ELITE_CUSTOM_FAMILIES[rootSlug] ?? []
    for (const cf of customFamilies) {
      if (!familyMap.has(cf.slug)) {
        familyMap.set(cf.slug, { slug: cf.slug, name: cf.name, sourceUrl: cf.url })
      }
    }

    let families = [...familyMap.values()]
    if (familiesToCrawl && familiesToCrawl.length > 0) {
      const familySet = new Set(familiesToCrawl)
      families = families.filter(f => familySet.has(f.slug))
      console.log(`[Category] ${rootSlug}: filtered to ${families.length} families (--families filter active)`)
    } else {
      console.log(`[Category] ${rootSlug}: found ${families.length} sub-categories total (${customFamilies.length} custom landing pages merged)`)
    }

    // Fallback: if no sub-categories found, paginate the WooCommerce root directly
    if (families.length === 0) {
      const wooPath = ELITE_WOO_FALLBACK_PATHS[rootSlug]
      if (wooPath) {
        const rootName = rootSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        families.push({ slug: rootSlug, name: rootName, sourceUrl: `${BASE_URL}${wooPath}` })
        console.log(`[Category] ${rootSlug}: falling back to WooCommerce root`)
      }
    }

    // Collect product URLs from each family (with pagination)
    for (const family of families) {
      const productUrls = await collectProductUrlsFromCategoryPage(page, family.sourceUrl)
      console.log(`[Category]   ${family.slug}: ${productUrls.length} products`)

      for (const url of productUrls) {
        entries.push({
          url,
          rootSlug,
          familySlug: family.slug,
          familyName: family.name,
          familySourceUrl: family.sourceUrl,
        })
      }
    }
  } catch (err) {
    console.error(`[Category] Failed for ${rootSlug}:`, err)
  } finally {
    await page.close()
  }

  return entries
}

// ─── Per-Product Extraction ───────────────────────────────────────────────────

async function extractProductFromPage(
  browser: Browser,
  url: string
): Promise<EliteProduct | null> {
  const page = await browser.newPage()
  const evidence: CrawlEvidence = {
    pageUrl: url,
    errors: [],
    attemptedPdfUrls: [],
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await delay(1000)

    const html = await page.content()
    const $ = cheerio.load(html)

    const pageTitle = $('title').text() || $('h1').first().text()
    evidence.pageTitle = pageTitle.trim()

    // Capture product image URL before any DOM mutation
    const productImgUrl =
      $('img.wp-post-image').attr('data-large_image') ||
      $('img.wp-post-image').attr('src') ||
      $('.woocommerce-product-gallery__image a').first().attr('href') ||
      $('.woocommerce-product-gallery img').first().attr('src') ||
      null

    // HTML text — fallback/supplement source
    $('script, style, nav, footer, header').remove()
    const htmlText = $('body').text().replace(/\s+/g, ' ').trim()

    // Catalog number candidate from URL slug
    const urlMatch = url.match(/\/products?\/([\w-]+)\/?$/)
    const candidate = (urlMatch ? urlMatch[1] : pageTitle.split(' ')[0]).toUpperCase()
    evidence.crawlCatalogCandidate = candidate

    // PDF candidates: page-linked (highest priority) + CDN variants
    const pagePdfLinks: string[] = []
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (href.toLowerCase().includes('.pdf')) {
        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
        if (!pagePdfLinks.includes(fullUrl)) pagePdfLinks.push(fullUrl)
      }
      return true
    })

    const slugRaw = urlMatch?.[1] ?? candidate.toLowerCase()
    const cdnVariants = [
      `${SPEC_SHEET_CDN}/${candidate}.pdf`,
      `${SPEC_SHEET_CDN}/${candidate.toLowerCase()}.pdf`,
      `${SPEC_SHEET_CDN}/${candidate.replace(/-/g, '_')}.pdf`,
      `${SPEC_SHEET_CDN}/${candidate.toLowerCase().replace(/-/g, '_')}.pdf`,
      `${SPEC_SHEET_CDN}/${slugRaw}.pdf`,
    ].filter((u, i, arr) => arr.indexOf(u) === i)

    // Merge: page links first (canonical), then CDN variants
    const allCandidates = [
      ...pagePdfLinks,
      ...cdnVariants.filter((u) => !pagePdfLinks.includes(u)),
    ]

    // Check local cache first
    const cached = getSpecSheetPath('elite', candidate)
    let pdfResult: PdfResult | null = null
    let specSheetPath: string | undefined

    if (cached) {
      specSheetPath = cached
      evidence.pdfDownloadSuccess = true
      evidence.discoveredPdfUrl = 'cached'
    } else {
      // Try each candidate in priority order; first valid %PDF wins
      for (const candidateUrl of allCandidates) {
        evidence.attemptedPdfUrls!.push(candidateUrl)
        pdfResult = await withRetryOrNull(() => downloadValidPdf(candidateUrl), { label: `pdf ${candidate}` })
        if (pdfResult) {
          evidence.discoveredPdfUrl = candidateUrl
          evidence.pdfDownloadSuccess = true
          const saveName = pdfResult.filename || candidate
          specSheetPath = saveSpecSheet('elite', saveName, pdfResult.buffer)
          console.log(`  [PDF] Found: ${candidateUrl} → ${saveName}`)
          break
        }
      }

      if (!pdfResult) {
        evidence.pdfDownloadSuccess = false
        evidence.errors!.push(
          `PDF not found after ${allCandidates.length} attempts. Tried: ${allCandidates.join(', ')}`
        )
        console.warn(`  [PDF] Not found for: ${candidate}`)
      }
    }

    // Authoritative catalog number: trust PDF filename over slug when available
    const catalogNumber = (pdfResult?.filename ? pdfResult.filename : candidate).toUpperCase()

    // Thumbnail: download product image if not already cached
    const thumbPath = getThumbnailPath('elite', catalogNumber)
    if (productImgUrl && !fs.existsSync(thumbPath)) {
      const fullImgUrl = productImgUrl.startsWith('http') ? productImgUrl : `${BASE_URL}${productImgUrl}`
      const imgBuf = await withRetryOrNull(() => downloadImageBuffer(fullImgUrl), { label: `image ${catalogNumber}` })
      if (imgBuf) {
        const thumbDir = path.dirname(thumbPath)
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })
        fs.writeFileSync(thumbPath, imgBuf)
      }
    }


    const displayName =
      $('h1').first().text().trim() ||
      $('[class*="product-title"], [class*="product-name"]').first().text().trim() ||
      pageTitle.trim() ||
      catalogNumber

    // Family extraction — heuristic from catalog number prefix, used for display
    const familyMatch = catalogNumber.match(/^([A-Z]+\d*)/i)
    const familyName = familyMatch ? familyMatch[1] : undefined

    // Spec extraction: PDF-first, HTML-assisted when needed
    let combinedText = htmlText
    let parseMethod: CrawlEvidence['parseMethod'] = 'html_only'

    if (specSheetPath && (pdfResult || cached)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodePath = require('path')
        const absPath = nodePath.join(process.cwd(), 'public', specSheetPath)
        if (fs.existsSync(absPath)) {
          const pdfBuf = fs.readFileSync(absPath)
          const pdfData = await pdfParse(pdfBuf)
          // PDF text as primary; HTML appended for any fields the PDF misses
          combinedText = pdfData.text + ' ' + htmlText
          parseMethod = 'pdf'
        }
      } catch {
        evidence.errors!.push('PDF text extraction failed — using HTML text only')
      }
    }

    // Pass 1: Regex extraction
    const { specs: regexSpecs, provenance: regexProvenance } = extractByRegex(combinedText)
    const regexConfidence = computeOverallConfidence(regexProvenance)

    // Annotate if PDF was found but spec confidence is still weak
    if (parseMethod === 'pdf' && regexConfidence < 0.5) {
      parseMethod = 'pdf+html'
    }

    // Pass 2: AI fallback when confidence is low
    let finalSpecs = regexSpecs
    let finalProvenance = regexProvenance

    if (regexConfidence < 0.5) {
      console.log(
        `  [AI] Low confidence (${regexConfidence.toFixed(2)}) for ${catalogNumber}, running AI fallback...`
      )
      const { specs: aiSpecs, provenance: aiProvenance } = await extractByAI(
        combinedText,
        regexSpecs,
        regexProvenance
      )
      finalSpecs = aiSpecs
      finalProvenance = aiProvenance
    }

    const overallConfidence = computeOverallConfidence(finalProvenance)

    // Normalize typed fields
    if (finalSpecs.voltage) {
      const volt = normalizeVoltage(String(finalSpecs.voltage))
      if (!volt) {
        evidence.unmappedValues = { ...evidence.unmappedValues, voltage: String(finalSpecs.voltage) }
      }
    }
    if (finalSpecs.formFactor) {
      finalSpecs.formFactor = normalizeFormFactor(String(finalSpecs.formFactor))
    }

    evidence.parseMethod = parseMethod
    evidence.fieldCountExtracted = Object.keys(finalProvenance).length
    evidence.extractionConfidence = overallConfidence

    // Pass 3: Config table extraction (always runs when PDF text is available)
    let configOptions: Record<string, string[]> | null = null
    if (specSheetPath) {
      configOptions = await extractConfigTable(combinedText)
      if (configOptions) {
        console.log(`  [Config] Extracted ${Object.keys(configOptions).length} config columns for ${catalogNumber}`)
      }
    }

    return {
      catalogNumber,
      crawlCatalogCandidate: candidate,
      displayName,
      familyName,
      productPageUrl: url,
      rawText: combinedText.slice(0, 5000),
      specs: finalSpecs as Record<string, unknown>,
      provenance: finalProvenance,
      overallConfidence,
      crawlEvidence: evidence,
      specSheetPath,
      specSheetUrl: evidence.discoveredPdfUrl !== 'cached' ? evidence.discoveredPdfUrl : undefined,
      configOptions,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    evidence.errors!.push(message)
    console.error(`[Crawl] Failed for ${url}:`, message)
    return null
  } finally {
    await page.close()
  }
}

// ─── Main Crawl Entry Point ───────────────────────────────────────────────────

export async function crawlElite(
  rootCategoriesToCrawl: string[] = Object.keys(ELITE_ROOT_CATEGORY_PATHS),
  familiesToCrawl?: string[]
): Promise<EliteProduct[]> {
  console.log('[Elite Crawler] Starting (category-based mode)...')
  console.log(`[Elite Crawler] Categories: ${rootCategoriesToCrawl.join(', ')}`)
  if (familiesToCrawl && familiesToCrawl.length > 0) {
    console.log(`[Elite Crawler] Families filter: ${familiesToCrawl.join(', ')}`)
  }

  const browser = await chromium.launch({ headless: true })

  try {
    // Collect all product URLs with category context, deduplicated across categories
    const allEntries: CrawlEntry[] = []
    const seenUrls = new Set<string>()

    for (const rootSlug of rootCategoriesToCrawl) {
      const elitePath = ELITE_ROOT_CATEGORY_PATHS[rootSlug]
      if (!elitePath) {
        console.warn(`[Elite] Unknown root category slug: "${rootSlug}" — skipping`)
        continue
      }

      const entries = await discoverProductsByCategoryPage(browser, rootSlug, elitePath, familiesToCrawl)

      let addedCount = 0
      for (const entry of entries) {
        if (!seenUrls.has(entry.url)) {
          seenUrls.add(entry.url)
          allEntries.push(entry)
          addedCount++
        }
      }
      console.log(`[Category] ${rootSlug}: ${addedCount} unique products queued`)
    }

    if (allEntries.length === 0) {
      console.warn('[Elite] No product URLs found — check iuseelite.com structure')
      return []
    }

    console.log(`\n[Elite] Processing ${allEntries.length} products total (concurrency=5)...`)
    const results: EliteProduct[] = []
    let completed = 0
    const limit = pLimit(5)

    await Promise.all(
      allEntries.map((entry) =>
        limit(async () => {
          const product = await extractProductFromPage(browser, entry.url)
          completed++
          console.log(`[${completed}/${allEntries.length}] ${entry.url}`)
          if (product) {
            // Attach category context from discovery phase
            product.rootCategorySlug = entry.rootSlug
            product.categoryFamilySlug = entry.familySlug
            product.categoryFamilyName = entry.familyName
            product.categoryFamilySourceUrl = entry.familySourceUrl
            results.push(product)
          }
        })
      )
    )

    const pdfCount = results.filter((r) => r.crawlEvidence.pdfDownloadSuccess).length
    const htmlOnly = results.filter((r) => r.crawlEvidence.parseMethod === 'html_only').length
    console.log(
      `\n[Elite] Done. ${results.length} products | ${pdfCount} with PDFs | ${htmlOnly} HTML-only`
    )
    return results
  } finally {
    await browser.close()
  }
}
