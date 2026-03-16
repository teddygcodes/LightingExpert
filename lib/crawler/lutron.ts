/**
 * Lutron crawler — uses support.lutron.com as data source.
 *
 * NOTE: www.lutron.com is blocked by Incapsula enterprise bot protection
 * (returns HTTP 403 with empty challenge iframe for all headless browsers).
 * support.lutron.com is server-rendered HTML and can be fetched directly
 * without a browser — cheerio is used for HTML parsing.
 *
 * Lighting brands (Ketra, Rania, Lumaris) are only on www.lutron.com
 * and cannot be crawled. Only Controls products are available here.
 */

import https from 'https'
import http from 'http'
import path from 'path'
import * as cheerio from 'cheerio'
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

const SUPPORT_BASE = 'https://support.lutron.com'
const STEALTH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Known Lutron brand names — used to detect brandName from page title
const KNOWN_BRANDS = [
  'Ketra', 'Rania', 'Lumaris', 'Maestro', 'Diva', 'Sunnata', 'Pico',
  'Athena', 'Vive', 'Quantum', 'HomeWorks', 'Caséta', 'RadioRA',
  'seeTouch', 'Palladiom', 'Signature', 'Aviena', 'Sivoia',
]

// ─── Category path mapping ────────────────────────────────────────────────────

export const LUTRON_ROOT_CATEGORY_PATHS: Record<string, string> = {
  lighting:  '/lighting',
  controls:  '/controls',
}

// Path segments that indicate a non-product URL (disqualify entire path)
const NON_PRODUCT_SEGMENTS = new Set([
  'documents', 'faqs', 'videos', 'category-selector',
])

// Last-segment values that are not catalog numbers
const NON_CATALOG_LAST_SEGMENTS = new Set([
  'component', 'product-specification-submittals', 'product',
  'product-information', 'installation-instructions', 'spec-sheet',
  'installation', 'application-notes', 'installation-guide',
  'performance-specifications', 'product-brochures', 'warranty',
  'wiring-diagrams',
])

// ─── Brand definitions for support.lutron.com ────────────────────────────────

interface BrandDef {
  slug: string           // brand slug in support.lutron.com URLs
  displayName: string
  rootCategory: string   // 'controls' or 'lighting'
  subcategorySlug: string
  subcategoryName: string
}

// Only controls brands are available on support.lutron.com.
// www.lutron.com lighting brands (Ketra, Rania, Lumaris) are Incapsula-blocked.
const SUPPORT_BRANDS: BrandDef[] = [
  { slug: 'maestro',        displayName: 'Maestro',         rootCategory: 'controls', subcategorySlug: 'dimmers-switches',   subcategoryName: 'Dimmers & Switches' },
  { slug: 'diva',           displayName: 'Diva',            rootCategory: 'controls', subcategorySlug: 'dimmers-switches',   subcategoryName: 'Dimmers & Switches' },
  { slug: 'sunnata',        displayName: 'Sunnata',         rootCategory: 'controls', subcategorySlug: 'dimmers-switches',   subcategoryName: 'Dimmers & Switches' },
  { slug: 'casetawireless', displayName: 'Caséta Wireless', rootCategory: 'controls', subcategorySlug: 'dimmers-switches',   subcategoryName: 'Dimmers & Switches' },
  { slug: 'radiora3',       displayName: 'RadioRA 3',       rootCategory: 'controls', subcategorySlug: 'commercial-systems', subcategoryName: 'Commercial Systems' },
  { slug: 'homeworks',      displayName: 'HomeWorks',       rootCategory: 'controls', subcategorySlug: 'commercial-systems', subcategoryName: 'Commercial Systems' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface LutronCrawlEntry {
  url: string
  productId: string           // URL slug (last path segment)
  brandSlug: string
  brandDisplayName: string
  rootSlug: string
  subcategorySlug: string
  subcategoryName: string
  subcategorySourceUrl: string
}

export interface LutronProduct {
  productId: string
  catalogNumber: string       // uppercase catalog number, falls back to URL slug
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

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchHtml(url: string, redirects = 0): Promise<string | null> {
  if (redirects > 5) return null
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(url, {
      headers: {
        'User-Agent': STEALTH_UA,
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': SUPPORT_BASE,
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        res.resume()
        if (loc) resolve(fetchHtml(loc.startsWith('http') ? loc : `${SUPPORT_BASE}${loc}`, redirects + 1))
        else resolve(null)
        return
      }
      if ((res.statusCode ?? 0) >= 400) { res.resume(); resolve(null); return }
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', () => resolve(null))
    req.setTimeout(30000, () => { req.destroy(); resolve(null) })
  })
}

interface PdfResult { buffer: Buffer; resolvedUrl: string; filename: string }

async function downloadValidPdf(url: string, redirects = 0): Promise<PdfResult | null> {
  if (redirects > 5) return null
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(url, {
      headers: {
        'User-Agent': STEALTH_UA,
        'Accept': 'application/pdf,*/*',
        'Referer': SUPPORT_BASE,
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        res.resume()
        if (loc) resolve(downloadValidPdf(loc.startsWith('http') ? loc : `${SUPPORT_BASE}${loc}`, redirects + 1))
        else resolve(null)
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
          const filename = path.basename(new URL(url).pathname).replace(/\.pdf$/i, '')
          resolve({ buffer: buf, resolvedUrl: url, filename })
        } catch {
          resolve({ buffer: buf, resolvedUrl: url, filename: '' })
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(30000, () => { req.destroy(); resolve(null) })
  })
}

function downloadImageBuffer(url: string, redirects = 0): Promise<Buffer | null> {
  if (redirects > 3) return Promise.resolve(null)
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        res.resume()
        resolve(loc ? downloadImageBuffer(loc.startsWith('http') ? loc : `${SUPPORT_BASE}${loc}`, redirects + 1) : null)
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

// ─── Catalog URL Discovery ────────────────────────────────────────────────────

/**
 * Fetch the brand's component root page and extract all catalog-number leaf URLs.
 * The support site sidebar renders the full component tree:
 *   brand → category → subcategory → individual catalog numbers.
 * A single page fetch gives us all catalog numbers for the brand.
 */
async function collectCatalogUrlsFromBrand(
  brand: BrandDef
): Promise<Array<{ url: string; productId: string }>> {
  const entryUrl = `${SUPPORT_BASE}/us/en/product/${brand.slug}/component`

  const html = await fetchHtml(entryUrl)
  if (!html) {
    console.warn(`  [Discovery] Failed to fetch ${entryUrl}`)
    return []
  }

  const $ = cheerio.load(html)
  const allPaths = new Set<string>()

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    // Handle relative and absolute hrefs
    let pathname: string
    try {
      const u = href.startsWith('http') ? new URL(href) : new URL(href, SUPPORT_BASE)
      if (u.hostname !== 'support.lutron.com') return
      pathname = u.pathname
    } catch { return }

    if (pathname.includes(`/product/${brand.slug}/component/`)) {
      allPaths.add(pathname)
    }
  })

  if (allPaths.size === 0) {
    console.warn(`  [Discovery] No component links for brand "${brand.slug}"`)
    return []
  }

  const pathArray = Array.from(allPaths)
  const leafPaths = pathArray.filter((p) => {
    const segments = p.split('/').filter(Boolean)
    const lastSeg = segments[segments.length - 1] ?? ''
    if (segments.some(s => NON_PRODUCT_SEGMENTS.has(s))) return false
    if (NON_CATALOG_LAST_SEGMENTS.has(lastSeg)) return false
    return !pathArray.some((other) => other !== p && other.startsWith(p + '/'))
  })

  const results: Array<{ url: string; productId: string }> = []
  const seen = new Set<string>()

  for (const p of leafPaths) {
    const parts = p.split('/').filter(Boolean)
    const productId = parts[parts.length - 1]
    if (!productId || seen.has(productId)) continue
    seen.add(productId)
    results.push({ url: `${SUPPORT_BASE}${p}`, productId })
  }

  console.log(`  [Discovery] Found ${results.length} catalog numbers for "${brand.slug}"`)
  return results
}

// ─── Spec Parsing ─────────────────────────────────────────────────────────────

function parseLutronSpecs(
  rawSpecs: Record<string, string>
): { specs: RawSpecs; provenance: FieldProvenanceMap } {
  const specs: RawSpecs = {}
  const provenance: FieldProvenanceMap = {}

  function fp(rawValue: string) {
    return { source: 'REGEX' as const, confidence: 0.95, rawValue }
  }
  function fpLow(rawValue: string) {
    return { source: 'REGEX' as const, confidence: 0.7, rawValue }
  }

  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (rawSpecs[k]) return rawSpecs[k]
    }
    return ''
  }

  // ── Lumens ──────────────────────────────────────────────────────────────────
  const lumensRaw = get('Lumen Output', 'Lumen Range', 'Lumens', 'Light Output')
  if (lumensRaw) {
    const rangeMatch = lumensRaw.match(/(\d[\d,]*)\s*(?:lm|LM)?\s*[-–]\s*(\d[\d,]*)\s*(?:lm|LM)?/)
    if (rangeMatch) {
      specs.lumensMin = parseInt(rangeMatch[1].replace(/,/g, ''))
      specs.lumensMax = parseInt(rangeMatch[2].replace(/,/g, ''))
      provenance.lumensMin = fp(lumensRaw)
      provenance.lumensMax = fp(lumensRaw)
    } else {
      const nums = [...lumensRaw.matchAll(/(\d[\d,]*)\s*(?:lm|LM)?/gi)]
        .map(m => parseInt(m[1].replace(/,/g, '')))
        .filter(n => !isNaN(n) && n > 100)
      if (nums.length === 1) {
        specs.lumens = nums[0]
        provenance.lumens = fp(lumensRaw)
      } else if (nums.length > 1) {
        specs.lumensMin = Math.min(...nums)
        specs.lumensMax = Math.max(...nums)
        provenance.lumensMin = fp(lumensRaw)
        provenance.lumensMax = fp(lumensRaw)
      }
    }
  }

  // ── CCT ─────────────────────────────────────────────────────────────────────
  const cctRaw = get('Color Temperature', 'Color Temperature Range', 'CCT', 'CCT Range')
  if (cctRaw) {
    const cctValues = [...cctRaw.matchAll(/(\d{4})\s*K?/gi)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1400 && n <= 10000)
    if (cctValues.length > 0) {
      specs.cctOptions = [...new Set(cctValues)].sort()
      provenance.cctOptions = fp(cctRaw)
    }
  }

  // ── CRI ─────────────────────────────────────────────────────────────────────
  const criRaw = get('CRI', 'Color Rendering Index', 'Color Rendering')
  if (criRaw) {
    const allCri = criRaw.match(/\d{2,3}/g)?.map(Number) ?? []
    if (allCri.length > 0) {
      specs.cri = Math.min(...allCri)
      provenance.cri = fp(criRaw)
    }
  }

  // ── Wattage ──────────────────────────────────────────────────────────────────
  const wattRaw = get('Max Watts', 'Maximum Wattage', 'Wattage', 'Input Watts', 'Power', 'Load Wattage')
  if (wattRaw) {
    const rangeMatch = wattRaw.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/)
    if (rangeMatch) {
      specs.wattageMin = parseFloat(rangeMatch[1])
      specs.wattageMax = parseFloat(rangeMatch[2])
      provenance.wattageMin = fp(wattRaw)
      provenance.wattageMax = fp(wattRaw)
    } else {
      const wattValues = [...wattRaw.matchAll(/(\d+(?:\.\d+)?)/g)]
        .map(m => parseFloat(m[1]))
        .filter(n => !isNaN(n) && n > 0 && n < 10000)
      if (wattValues.length === 1) {
        specs.wattage = wattValues[0]
        provenance.wattage = fp(wattRaw)
      } else if (wattValues.length > 1) {
        specs.wattageMax = Math.max(...wattValues)
        provenance.wattageMax = fp(wattRaw)
      }
    }
  }

  // ── Voltage ──────────────────────────────────────────────────────────────────
  const voltRaw = get('Voltage', 'Input Voltage', 'Voltage Rating', 'Supply Voltage', 'Line Voltage')
  if (voltRaw) {
    const tokens = voltRaw.split(/[,;]/).map(s => s.trim())
    const matched = tokens.find(tok => normalizeVoltage(tok) !== undefined)
    specs.voltage = (matched ?? tokens[0]).trim()
    provenance.voltage = matched ? fp(voltRaw) : fpLow(voltRaw)
  }

  // ── Dimming ──────────────────────────────────────────────────────────────────
  const dimmingRaw = get('Dimming Protocol', 'Dimming', 'Control Protocol', 'Dimming Range', 'Load Type')
  if (dimmingRaw) {
    const types = normalizeDimmingTypes(dimmingRaw)
    if (types.length > 0 || /dim|0.?10|phase/i.test(dimmingRaw)) {
      specs.dimmable = true
      specs.dimmingType = dimmingRaw.trim()
      const conf = types.length > 0 ? fp(dimmingRaw) : fpLow(dimmingRaw)
      provenance.dimmable = conf
      provenance.dimmingType = conf
    }
  }

  // ── Mounting ─────────────────────────────────────────────────────────────────
  const mountRaw = get('Mounting Type', 'Mounting', 'Mount Type', 'Installation')
  if (mountRaw) {
    specs.mountingType = mountRaw.trim()
    const types = normalizeMountingTypes(mountRaw)
    provenance.mountingType = types.length > 0 ? fp(mountRaw) : fpLow(mountRaw)
  }

  // ── Environmental ─────────────────────────────────────────────────────────────
  const envRaw = get('Environmental Listing', 'Location Rating', 'Location', 'Rating', 'Environment')
  if (envRaw) {
    if (/\bwet\b/i.test(envRaw)) {
      specs.wetLocation = true
      provenance.wetLocation = fp(envRaw)
    } else if (/\bdamp\b/i.test(envRaw)) {
      specs.dampLocation = true
      provenance.dampLocation = fp(envRaw)
    }
  }

  // ── IP Rating ────────────────────────────────────────────────────────────────
  const ipRaw = get('IP Rating', 'IP', 'Ingress Protection')
  if (ipRaw) {
    const ipMatch = ipRaw.match(/IP\s*(\d{2})/i)
    if (ipMatch) {
      specs.ipRating = `IP${ipMatch[1]}`
      provenance.ipRating = fp(ipRaw)
    }
  }

  // ── Certifications ────────────────────────────────────────────────────────────
  const certRaw = get('Certifications', 'Listed', 'Listings', 'Regulatory', 'Agency Approvals')
  if (certRaw) {
    if (/\bUL\b|cULus|ETL|CSA/i.test(certRaw)) {
      specs.ulListed = true
      provenance.ulListed = fp(certRaw)
    }
    if (/DLC\s*Premium/i.test(certRaw)) {
      specs.dlcListed = true
      specs.dlcPremium = true
      provenance.dlcListed = fp(certRaw)
      provenance.dlcPremium = fp(certRaw)
    } else if (/\bDLC\b|DesignLights/i.test(certRaw)) {
      specs.dlcListed = true
      specs.dlcPremium = false
      provenance.dlcListed = fp(certRaw)
      provenance.dlcPremium = fp(certRaw)
    }
  }

  // ── Efficacy ──────────────────────────────────────────────────────────────────
  const efficacyRaw = get('Efficacy', 'LPW', 'Lumens Per Watt')
  if (efficacyRaw) {
    const m = efficacyRaw.match(/(\d+(?:\.\d+)?)/)
    if (m) {
      specs.efficacy = parseFloat(m[1])
      provenance.efficacy = fp(efficacyRaw)
    }
  }

  // ── Beam Angle ────────────────────────────────────────────────────────────────
  const beamRaw = get('Beam Angle', 'Beam Spread', 'Distribution')
  if (beamRaw) {
    const beamMatch = beamRaw.match(/(\d+(?:\.\d+)?)\s*°/)
    if (beamMatch) {
      specs.beamAngle = parseFloat(beamMatch[1])
      provenance.beamAngle = fp(beamRaw)
    }
  }

  // ── Form Factor ───────────────────────────────────────────────────────────────
  const formRaw = get('Form Factor', 'Type', 'Product Type', 'Fixture Type', 'Device Type')
  if (formRaw) {
    const ff = normalizeFormFactor(formRaw)
    if (ff) {
      specs.formFactor = ff
      provenance.formFactor = fpLow(formRaw)
    }
  }

  return { specs, provenance }
}

// ─── Per-Product Extraction ───────────────────────────────────────────────────

async function extractProduct(entry: LutronCrawlEntry): Promise<LutronProduct | null> {
  const evidence: CrawlEvidence = {
    pageUrl: entry.url,
    errors: [],
    attemptedPdfUrls: [],
  }

  try {
    // ── Fetch product page ───────────────────────────────────────────────────
    const html = await fetchHtml(entry.url)
    if (!html) {
      evidence.errors!.push('Failed to fetch product page')
      return null
    }

    const $ = cheerio.load(html)

    // Product name — page title format is "Brand | CATALOG-NUM | Technical Documents..."
    // Extract the catalog number segment from the title if present, otherwise use brand + slug
    const titleFull = $('title').text().trim()
    const titleSegments = titleFull.split('|').map(s => s.trim()).filter(Boolean)
    // Find a title segment that matches a catalog number pattern (uppercase, has digits/hyphens)
    const titleCatalogSeg = titleSegments.find(s => /^[A-Z][A-Z0-9\-]{2,20}$/.test(s))
    const displayName = titleCatalogSeg
      ? `${entry.brandDisplayName} ${titleCatalogSeg}`
      : `${entry.brandDisplayName} ${entry.productId.toUpperCase()}`

    // Brand detection from display name
    let brandName = entry.brandDisplayName
    for (const brand of KNOWN_BRANDS) {
      if (displayName.toLowerCase().includes(brand.toLowerCase())) {
        brandName = brand
        break
      }
    }

    // Catalog number — the URL slug IS the Lutron catalog number (lowercase version).
    // Convert to uppercase: macl-153m → MACL-153M, ms-hs3 → MS-HS3
    const catalogCode = entry.productId.toUpperCase()

    // Spec extraction — try multiple HTML patterns
    const rawSpecs: Record<string, string> = {}

    // Pattern 1: definition list
    $('dl').each((_, dl) => {
      const dts = $(dl).find('dt')
      const dds = $(dl).find('dd')
      dts.each((i, dt) => {
        const label = $(dt).text().trim()
        const value = $(dds[i]).text().replace(/\s+/g, ' ').trim()
        if (label && value && label.length < 80 && !rawSpecs[label]) rawSpecs[label] = value
      })
    })

    // Pattern 2: table rows
    if (Object.keys(rawSpecs).length === 0) {
      $('table tr').each((_, row) => {
        const cells = $(row).find('td, th')
        if (cells.length >= 2) {
          const label = cells.eq(0).text().trim()
          const value = cells.eq(1).text().replace(/\s+/g, ' ').trim()
          if (label && value && label.length < 80 && !rawSpecs[label]) rawSpecs[label] = value
        }
      })
    }

    // ── Fetch spec sheets from product-specification-submittals page only ────
    // The main product page links to ALL document types (wiring diagrams, install
    // guides, performance specs, etc.). Only the submittal page is guaranteed
    // to contain actual specification submittal PDFs.
    const specSheetLinksAll: Array<{ label: string; url: string }> = []
    const seenPdfs = new Set<string>()

    const submittalUrl = `${entry.url}/documents/product-specification-submittals`
    const submittalHtml = await fetchHtml(submittalUrl)
    if (submittalHtml) {
      const $s = cheerio.load(submittalHtml)
      $s('a[href*="assets.lutron.com/a/documents/"]').each((_, el) => {
        const href = $s(el).attr('href') || ''
        if (!href.toLowerCase().endsWith('.pdf')) return
        if (seenPdfs.has(href)) return
        seenPdfs.add(href)
        const label = $s(el).text().trim()
        specSheetLinksAll.push({ label: label || 'Spec Sheet', url: href })
      })
      if (specSheetLinksAll.length > 0) {
        console.log(`  [PDF] Found ${specSheetLinksAll.length} spec sheet(s) for ${entry.productId}`)
      }
    }

    // Thumbnail — look for product images on the page
    let thumbnailUrl = ''
    $('img[src*="lutron.com"]').each((_, el) => {
      const src = $(el).attr('src') || ''
      if (/logo|icon|flag|arrow|check/i.test(src)) return
      if (!thumbnailUrl) thumbnailUrl = src
    })

    evidence.pageTitle = displayName || entry.productId
    evidence.crawlCatalogCandidate = catalogCode

    const catalogNumber = catalogCode

    // ── Parse Specs ─────────────────────────────────────────────────────────
    const { specs: parsedSpecs, provenance: parsedProvenance } = parseLutronSpecs(rawSpecs)
    const regexConfidence = computeOverallConfidence(parsedProvenance)
    evidence.extractionConfidence = regexConfidence

    let finalSpecs: Record<string, unknown> = parsedSpecs as Record<string, unknown>
    let finalProvenance: FieldProvenanceMap = parsedProvenance

    if (regexConfidence < 0.5 && Object.keys(rawSpecs).length > 0) {
      const specText = Object.entries(rawSpecs).map(([k, v]) => `${k}: ${v}`).join('\n')
      const { specs: aiSpecs, provenance: aiProvenance } = await extractByAI(
        specText,
        parsedSpecs,
        parsedProvenance
      )
      finalSpecs = aiSpecs as Record<string, unknown>
      finalProvenance = aiProvenance
    }

    const overallConfidence = computeOverallConfidence(finalProvenance)

    // ── Download Primary Spec Sheet PDF ─────────────────────────────────────
    const primaryLink =
      specSheetLinksAll.find(s => /spec(?:ification)?\s*sheet/i.test(s.label)) ??
      specSheetLinksAll.find(s => !/submittal|install|guide|wiring/i.test(s.label)) ??
      specSheetLinksAll[0] ??
      null

    let specSheetPath: string | undefined
    let resolvedSpecSheetUrl: string | undefined

    const cachedPath = getSpecSheetPath('lutron', entry.productId)
    if (cachedPath) {
      specSheetPath = cachedPath
      evidence.pdfDownloadSuccess = true
      evidence.discoveredPdfUrl = 'cached'
    } else if (primaryLink) {
      evidence.attemptedPdfUrls!.push(primaryLink.url)
      const pdfResult = await downloadValidPdf(primaryLink.url)
      if (pdfResult) {
        specSheetPath = saveSpecSheet('lutron', entry.productId, pdfResult.buffer)
        resolvedSpecSheetUrl = pdfResult.resolvedUrl
        evidence.discoveredPdfUrl = pdfResult.resolvedUrl
        evidence.pdfDownloadSuccess = true
        console.log(`  [PDF] Saved: ${path.basename(primaryLink.url)}`)
      } else {
        evidence.pdfDownloadSuccess = false
        resolvedSpecSheetUrl = primaryLink.url
        evidence.errors!.push(`PDF download failed: ${primaryLink.url}`)
      }
    } else {
      evidence.pdfDownloadSuccess = false
    }

    const specSheets: Array<{ label: string; url: string; path?: string }> =
      specSheetLinksAll.map((s) => ({
        label: s.label,
        url: s.url,
        path: primaryLink?.url === s.url ? specSheetPath : undefined,
      }))

    // ── Thumbnail ────────────────────────────────────────────────────────────
    const thumbPath = getThumbnailPath('lutron', catalogNumber)
    if (thumbnailUrl && !fs.existsSync(thumbPath)) {
      const imgBuf = await downloadImageBuffer(thumbnailUrl)
      if (imgBuf) {
        const thumbDir = path.dirname(thumbPath)
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })
        fs.writeFileSync(thumbPath, imgBuf)
      }
    }

    evidence.parseMethod = 'html_only'
    evidence.fieldCountExtracted = Object.keys(finalProvenance).length

    return {
      productId: entry.productId,
      catalogNumber,
      displayName,
      familyName: entry.brandDisplayName,
      brandName: brandName || entry.brandDisplayName,
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
    console.error(`[Lutron] Failed for ${entry.url}: ${message}`)
    return null
  }
}

// ─── Main Crawl Entry Point ───────────────────────────────────────────────────

export async function crawlLutron(
  rootCategoriesToCrawl?: string[]
): Promise<LutronProduct[]> {
  const rootSlugs = rootCategoriesToCrawl ?? Object.keys(LUTRON_ROOT_CATEGORY_PATHS)

  console.log('[Lutron Crawler] Starting (source: support.lutron.com, method: direct HTTP)')
  console.log(`[Lutron Crawler] Root categories: ${rootSlugs.join(', ')}`)

  const brandsToProcess = SUPPORT_BRANDS.filter(b => rootSlugs.includes(b.rootCategory))

  if (brandsToProcess.length === 0) {
    console.warn('[Lutron Crawler] No brands match requested categories.')
    if (rootSlugs.includes('lighting')) {
      console.warn('  Lighting brands (Ketra, Rania, Lumaris) are only on www.lutron.com,')
      console.warn('  which is blocked by Incapsula and cannot be crawled.')
    }
    return []
  }

  console.log(`[Lutron Crawler] Brands: ${brandsToProcess.map(b => b.slug).join(', ')}`)

  const allEntries = new Map<string, LutronCrawlEntry>()

  // Phase 1: discover all catalog-number URLs (direct HTTP, no browser needed)
  for (const brand of brandsToProcess) {
    console.log(`[Lutron] Discovering catalog numbers for "${brand.slug}"...`)
    const found = await collectCatalogUrlsFromBrand(brand)

    let newCount = 0
    for (const { url, productId } of found) {
      if (!allEntries.has(productId)) {
        allEntries.set(productId, {
          url,
          productId,
          brandSlug: brand.slug,
          brandDisplayName: brand.displayName,
          rootSlug: brand.rootCategory,
          subcategorySlug: brand.subcategorySlug,
          subcategoryName: brand.subcategoryName,
          subcategorySourceUrl: `${SUPPORT_BASE}/us/en/product/${brand.slug}/component`,
        })
        newCount++
      }
    }

    console.log(`[Lutron] ${brand.slug}: ${newCount} products queued`)
    await delay(500) // small delay between brand discovery requests
  }

  const entries = Array.from(allEntries.values())
  console.log(`[Lutron] Processing ${entries.length} products (concurrency=5)...`)

  if (entries.length === 0) {
    console.warn('[Lutron] No catalog URLs found. The support site structure may have changed.')
    return []
  }

  // Phase 2: extract product data (direct HTTP, concurrency=5)
  // Import pLimit dynamically to avoid issues
  const { default: pLimit } = await import('p-limit')
  const limit = pLimit(5)
  let completed = 0

  const results = await Promise.all(
    entries.map((entry) =>
      limit(async () => {
        await delay(200 + Math.random() * 300) // small jitter to avoid thundering herd
        const product = await extractProduct(entry)
        completed++
        if (product) {
          const pdfStatus = product.specSheetPath ? '📄' : product.specSheetUrl ? '🔗' : '✗'
          console.log(`[${completed}/${entries.length}] ${entry.productId} ✓ ${pdfStatus}`)
        } else {
          console.warn(`[${completed}/${entries.length}] ${entry.productId} ✗`)
        }
        return product
      })
    )
  )

  const products = results.filter((p): p is LutronProduct => p !== null)
  console.log(`[Lutron Crawler] Done. ${products.length}/${entries.length} products extracted.`)
  return products
}
