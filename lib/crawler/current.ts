import { chromium, BrowserContext, Page } from 'playwright'
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
import { withRetryOrNull } from './retry'

const BASE_URL = 'https://www.currentlighting.com'
const STEALTH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// ─── Category path mapping ────────────────────────────────────────────────────

export const CURRENT_ROOT_CATEGORY_PATHS: Record<string, string> = {
  indoor:   '/indoor-lighting',
  outdoor:  '/outdoor-lighting',
  controls: '/controls-sensors',
}

// Hardcoded subcategory map mirroring the three nav dropdowns exactly.
// listingUrl = the URL from the nav link (filter URL or hub URL — both paginate with ?page=N).
const CURRENT_SUBCATEGORIES: Record<string, Array<{ slug: string; name: string; listingUrl: string }>> = {
  indoor: [
    // Commercial Fixtures
    { slug: 'cove',                       name: 'Cove',                      listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Cove' },
    { slug: 'cylinders',                  name: 'Cylinders',                 listingUrl: '/indoor-lighting/cylinders' },
    { slug: 'downlights',                 name: 'Downlights',                listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Downlights' },
    { slug: 'linear-slot',                name: 'Linear Slot',               listingUrl: '/indoor-lighting/linear-slot' },
    { slug: 'linear-strip',               name: 'Linear Strip',              listingUrl: '/indoor-lighting/linear-strip' },
    { slug: 'linear-suspended',           name: 'Linear Suspended',          listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Linear%20Suspended' },
    { slug: 'pendant',                    name: 'Pendant',                   listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Pendant' },
    { slug: 'perimeter',                  name: 'Perimeter',                 listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Perimeter' },
    { slug: 'retrofit-kits',              name: 'Retrofit Kits',             listingUrl: '/indoor-lighting/retrofit-kits' },
    { slug: 'indoor-step-lights',         name: 'Step Lights',               listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Step%20Lights' },
    { slug: 'surface-mount',              name: 'Surface Mount',             listingUrl: '/indoor-lighting/surface-mount' },
    { slug: 'troffers-panels',            name: 'Troffers & Panels',         listingUrl: '/indoor-lighting/troffers-panels' },
    { slug: 'indoor-wall-mount',          name: 'Wall Mount',                listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Wall%20Mount' },
    { slug: 'wraps',                      name: 'Wraps',                     listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Wraps' },
    // Industrial Fixtures
    { slug: 'accessories-industrial',     name: 'Accessories',               listingUrl: '/products/product-category-filter/2101/subcategory/Accessories' },
    { slug: 'bay-lighting',               name: 'Bay Lighting',              listingUrl: '/indoor-lighting/bay-lighting' },
    { slug: 'enclosed-gasketed',          name: 'Enclosed & Gasketed',       listingUrl: '/indoor-lighting/enclosed-gasketed' },
    // Complex Environments
    { slug: 'behavioral-spaces',          name: 'Behavioral Spaces',         listingUrl: '/indoor-lighting/behavioral-spaces' },
    { slug: 'cleanroom',                  name: 'Cleanroom',                 listingUrl: '/indoor-lighting/cleanroom' },
    { slug: 'patient-room',               name: 'Patient Room',              listingUrl: '/indoor-lighting/patient-room' },
    { slug: 'surgical-imaging',           name: 'Surgical & Imaging',        listingUrl: '/indoor-lighting/surgical-and-imaging' },
    { slug: 'vandal',                     name: 'Vandal',                    listingUrl: '/indoor-lighting/vandal' },
    // Emergency & Exit
    { slug: 'accessories-emergency',      name: 'Accessories',               listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Accessories' },
    { slug: 'battery-packs',              name: 'Battery Packs',             listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Battery%20Packs' },
    { slug: 'central-lighting-inverters', name: 'Central Lighting Inverters',listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Central%20Lighting%20Inverters' },
    { slug: 'emergency-lighting-units',   name: 'Emergency Lighting Units',  listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Emergency%20Lighting%20Units' },
    { slug: 'exit-message-signs',         name: 'Exit & Message Signs',      listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Exit%20%26%20Message%20Signs' },
    { slug: 'remote-heads-fixtures',      name: 'Remote Heads & Fixtures',   listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Remote%20Heads%20%26%20Fixtures' },
    { slug: 'replacement-batteries',      name: 'Replacement Batteries',     listingUrl: '/products/product-category-filter/2101/category/4201/subcategory/Replacement%20Batteries' },
  ],
  outdoor: [
    // Fixtures
    { slug: 'area-site-roadway',          name: 'Area, Site & Roadway',      listingUrl: '/outdoor-lighting/area-site-roadway' },
    { slug: 'bollards',                   name: 'Bollards',                  listingUrl: '/outdoor-lighting/bollards' },
    { slug: 'canopy-garage',              name: 'Canopy & Garage',           listingUrl: '/outdoor-lighting/canopy-garage' },
    { slug: 'contemporary',               name: 'Contemporary',              listingUrl: '/outdoor-lighting/contemporary' },
    { slug: 'decorative-post-top',        name: 'Decorative & Post Top',     listingUrl: '/outdoor-lighting/decorative-post-top' },
    { slug: 'flood',                      name: 'Flood',                     listingUrl: '/outdoor-lighting/flood' },
    { slug: 'landscape',                  name: 'Landscape',                 listingUrl: '/products/product-category-filter/2101/category/4206/subcategory/Landscape' },
    { slug: 'traditional',                name: 'Traditional',               listingUrl: '/outdoor-lighting/traditional' },
    { slug: 'transitional',               name: 'Transitional',              listingUrl: '/outdoor-lighting/transitional' },
    { slug: 'outdoor-wall-mount',         name: 'Wall Mount',                listingUrl: '/outdoor-lighting/wall-mount' },
    // Other
    { slug: 'in-grade',                   name: 'In Grade',                  listingUrl: '/products/product-category-filter/2101/category/4206/subcategory/In%20Grade' },
    { slug: 'outdoor-sports-lighting',    name: 'Sports Lighting',           listingUrl: '/outdoor-lighting/sports-lighting' },
    { slug: 'outdoor-step-lights',        name: 'Step Lights',               listingUrl: '/products/product-category-filter/2101/category/4206/subcategory/Step%20Lights' },
    { slug: 'outdoor-linear',             name: 'Linear',                    listingUrl: '/products/product-category-filter/2101/category/4206/subcategory/Linear' },
    { slug: 'poles',                      name: 'Poles',                     listingUrl: '/products/product-category-filter/2101/category/4206/brand/ARCHITECTURAL%20AREA%20LIGHTING/brand/BEACON/brand/EXO/brand/KIM%20LIGHTING/subcategory/Poles' },
    { slug: 'arms-brackets',              name: 'Arms & Brackets',           listingUrl: '/products/product-category-filter/2101/category/4206/brand/ARCHITECTURAL%20AREA%20LIGHTING/brand/BEACON/brand/EXO/brand/KIM%20LIGHTING/subcategory/Arms%20%26%20Brackets' },
    { slug: 'outdoor-accessories',        name: 'Accessories',               listingUrl: '/products/product-category-filter/2101/category/4206/subcategory/Accessories' },
    { slug: 'outdoor-retrofit-kits',      name: 'Retrofit Kits',             listingUrl: '/products/product-category-filter/2101/category/4206/subcategory/Retrofit%20Kits' },
  ],
  controls: [
    // Wireless Controls
    { slug: 'nx-wireless',                name: 'NX Lighting Controls',      listingUrl: '/products/product-category-filter/2106/brand/NX%20LIGHTING%20CONTROLS/connectivity/Hybrid%20%28Wired%20%26%20Wireless%29/connectivity/Wireless/connectivity/Wireless%20Networked/connectivity/Wireless%20Standalone/controls_platform/NX%20Lighting%20Controls' },
    // Wired Controls
    { slug: 'nx-wired',                   name: 'NX Lighting Controls',      listingUrl: '/products/product-category-filter/2106/brand/NX%20LIGHTING%20CONTROLS/connectivity/Hybrid%20%28Wired%20%26%20Wireless%29/connectivity/Wired/controls_platform/NX%20Lighting%20Controls' },
    // Standalone Controls
    { slug: 'emergency-controls',         name: 'Emergency Controls',        listingUrl: '/products/product-category-filter/2106/component-type/Emergency%20Lighting' },
    { slug: 'power-packs-relays',         name: 'Power Packs & Relays',      listingUrl: '/products/product-category-filter/2106/component-type/Sensors%2C%20Power%20Packs%20%26%20Relays' },
    { slug: 'wallbox-devices',            name: 'Wallbox Devices',           listingUrl: '/products/product-category-filter/2106/component-type/Wallbox%20Devices' },
    // Panels
    { slug: 'nx-control-panels',          name: 'NX Control Panels',         listingUrl: '/products/product-category-filter/2106/component-type/NX%20Control%20Panels' },
    // Outdoor Controls
    { slug: 'nx-outdoor-controls',        name: 'NX Lighting Controls',      listingUrl: '/products/product-category-filter/2106/component-type/Outdoor%20Controls/controls_platform/NX%20Lighting%20Controls' },
    // OEM Lighting Components
    { slug: 'led-drivers',                name: 'LED Drivers',               listingUrl: '/products/product-category-filter/2106/component-type/Driver' },
    { slug: 'lighting-transformers',      name: 'Lighting Transformers',     listingUrl: '/products/product-category-filter/2106/component-type/Lighting%20Transformers' },
    { slug: 'surge-protectors',           name: 'Surge Protectors',          listingUrl: '/products/product-category-filter/2106/component-type/Surge%20Protectors' },
    // Catch-all — ensures any controls products not captured by specific filters above are still included
    { slug: 'controls-all',               name: 'Controls & Sensors',        listingUrl: '/products/product-category-filter/2106' },
  ],
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CurrentCrawlEntry {
  url: string
  productId: string          // numeric ID from URL last segment
  rootSlug: string
  subcategorySlug: string
  subcategoryName: string
  subcategorySourceUrl: string
}

export interface CurrentProduct {
  productId: string            // numeric ID from URL (e.g. "10216706")
  catalogNumber: string        // h1 catalog code (e.g. "NOR-1.5-R"); falls back to productId
  displayName: string
  familyName?: string
  brandName?: string           // from h1 first line (e.g. "KURT VERSEN")
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

// ─── Utilities ────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const selectors = [
    '#onetrust-accept-btn-handler',
    '.optanon-allow-all',
    'button[id*="accept-all"]',
    'button[id*="acceptAll"]',
    'button[class*="accept-all"]',
    '[aria-label*="Accept all"]',
    '[aria-label*="accept all"]',
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
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

interface PdfResult { buffer: Buffer; resolvedUrl: string; filename: string }

async function downloadValidPdf(url: string): Promise<PdfResult | null> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(url, {
      headers: {
        'User-Agent': STEALTH_UA,
        'Accept': 'application/pdf,*/*',
        'Referer': 'https://www.currentlighting.com/',
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        res.resume()
        if (loc) resolve(downloadValidPdf(loc.startsWith('http') ? loc : `${BASE_URL}${loc}`))
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
    req.setTimeout(25000, () => { req.destroy(); resolve(null) })
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

// ─── Product URL Collection ───────────────────────────────────────────────────

// Navigate a Current Lighting listing page (SSR Drupal) and collect all product URLs.
// Paginates via ?page=0, ?page=1, ... until no new products are found.
// Returns unique {url, productId} pairs found on this listing URL.
async function collectProductUrlsFromListingPage(
  page: Page,
  listingUrl: string
): Promise<Array<{ url: string; productId: string }>> {
  // Controls products live at root-level paths: /{slug}/{id}
  // Fixture products live at: /(indoor-lighting|outdoor-lighting)/{slug}/{id}
  const isControlsPage = listingUrl.includes('/product-category-filter/2106')

  const seen = new Set<string>()
  const results: Array<{ url: string; productId: string }> = []
  const fullBase = `${BASE_URL}${listingUrl}`

  for (let pageNum = 0; pageNum < 50; pageNum++) {
    const pageUrl = `${fullBase}${listingUrl.includes('?') ? '&' : '?'}page=${pageNum}`
    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await delay(1500)

      const hrefs: string[] = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => (a as HTMLAnchorElement).href)
      })

      let newCount = 0
      for (const href of hrefs) {
        let productId: string | undefined

        // Fixture URL: /indoor-lighting/{slug}/{id} or /outdoor-lighting/{slug}/{id}
        const fixtureMatch = href.match(/\/(indoor-lighting|outdoor-lighting)\/[^/]+\/(\d+)$/)
        if (fixtureMatch) {
          productId = fixtureMatch[2]
        } else if (isControlsPage) {
          // Controls products are at root-level: https://www.currentlighting.com/{slug}/{id}
          const controlsMatch = href.match(/www\.currentlighting\.com\/([a-z0-9][a-z0-9-]+)\/(\d{4,})$/)
          if (controlsMatch) productId = controlsMatch[2]
        }

        if (!productId) continue
        if (seen.has(productId)) continue
        seen.add(productId)
        const url = href.startsWith('http') ? href : `${BASE_URL}${href}`
        results.push({ url, productId })
        newCount++
      }

      if (newCount === 0) break  // No new products on this page — done
    } catch (err) {
      console.error(`[Current] Failed to load listing page ${pageUrl}:`, err)
      break
    }
  }

  return results
}

// ─── Spec Parsing ─────────────────────────────────────────────────────────────

function parseCurrentSpecs(
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
  const lumensRaw = get('Lumen Range', 'Lumens', 'Lumen Output')
  if (lumensRaw) {
    // Format: "288 - 685" or "3000 LM" or "3000, 4000"
    const rangeMatch = lumensRaw.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/)
    if (rangeMatch) {
      specs.lumensMin = parseInt(rangeMatch[1].replace(/,/g, ''))
      specs.lumensMax = parseInt(rangeMatch[2].replace(/,/g, ''))
      provenance.lumensMin = fp(lumensRaw)
      provenance.lumensMax = fp(lumensRaw)
    } else {
      const nums = [...lumensRaw.matchAll(/(\d[\d,]*)\s*(?:lm|LM|lumens?)?/gi)]
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
  const cctRaw = get('CCT', 'Color Temperature', 'CCT / LED Color')
  if (cctRaw) {
    const cctValues = [...cctRaw.matchAll(/(\d{4})\s*[Kk]?/g)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1800 && n <= 8000)
    if (cctValues.length > 0) {
      specs.cctOptions = [...new Set(cctValues)].sort()
      provenance.cctOptions = fp(cctRaw)
    }
  }

  // ── CRI ─────────────────────────────────────────────────────────────────────
  const criRaw = get('CRI', 'Color Rendering Index')
  if (criRaw) {
    const allCri = criRaw.match(/\d{2,3}/g)?.map(Number) ?? []
    if (allCri.length > 0) {
      specs.cri = Math.min(...allCri)
      provenance.cri = fp(criRaw)
    }
  }

  // ── Wattage ──────────────────────────────────────────────────────────────────
  const wattRaw = get('Wattage', 'Input Watts', 'Fixture Wattage')
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
        specs.wattageMin = Math.min(...wattValues)
        specs.wattageMax = Math.max(...wattValues)
        provenance.wattageMin = fp(wattRaw)
        provenance.wattageMax = fp(wattRaw)
      }
    }
  }

  // ── Voltage ──────────────────────────────────────────────────────────────────
  const voltRaw = get('Voltage', 'Input Voltage', 'Voltage Rating')
  if (voltRaw) {
    const tokens = voltRaw.split(/[,;]/).map(s => s.trim())
    const matched = tokens.find(tok => normalizeVoltage(tok) !== undefined)
    specs.voltage = (matched ?? tokens[0]).trim()
    provenance.voltage = matched ? fp(voltRaw) : fpLow(voltRaw)
  }

  // ── Dimming ──────────────────────────────────────────────────────────────────
  const dimmingRaw = get('Dimming Protocol', 'Dimming', 'Control')
  if (dimmingRaw) {
    const types = normalizeDimmingTypes(dimmingRaw)
    if (types.length > 0 || /dim|0.?10/i.test(dimmingRaw)) {
      specs.dimmable = true
      specs.dimmingType = dimmingRaw.trim()
      const conf = types.length > 0 ? fp(dimmingRaw) : fpLow(dimmingRaw)
      provenance.dimmable = conf
      provenance.dimmingType = conf
    }
  }

  // ── Mounting ─────────────────────────────────────────────────────────────────
  const mountRaw = get('Mounting Options', 'Mounting Type', 'Mounting')
  if (mountRaw) {
    const types = normalizeMountingTypes(mountRaw)
    specs.mountingType = mountRaw.trim()
    provenance.mountingType = types.length > 0 ? fp(mountRaw) : fpLow(mountRaw)
  }

  // ── Environmental ─────────────────────────────────────────────────────────────
  const envRaw = get('Environmental Listing', 'Location', 'Listing', 'Ratings')
  if (envRaw) {
    if (/\bwet\b/i.test(envRaw)) {
      specs.wetLocation = true
      provenance.wetLocation = fp(envRaw)
    } else if (/\bdamp\b/i.test(envRaw)) {
      specs.dampLocation = true
      provenance.dampLocation = fp(envRaw)
    }
  }

  // ── Certifications ────────────────────────────────────────────────────────────
  const certRaw = get('Certifications', 'Listings', 'Regulatory Listing')
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
  const beamRaw = get('Beam Angle', 'Distribution')
  if (beamRaw) {
    // Format: "Very Narrow (.36 SC / 20°), ..." — extract first degree value
    const beamMatch = beamRaw.match(/(\d+(?:\.\d+)?)\s*°/)
    if (beamMatch) {
      specs.beamAngle = parseFloat(beamMatch[1])
      provenance.beamAngle = fp(beamRaw)
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

  // ── Emergency Backup ─────────────────────────────────────────────────────────
  const emergRaw = get('Emergency', 'Emergency Backup')
  if (emergRaw && /yes|included|battery|backup|em/i.test(emergRaw)) {
    specs.emergencyBackup = true
    provenance.emergencyBackup = fp(emergRaw)
  }

  return { specs, provenance }
}

// ─── Per-Product Extraction ───────────────────────────────────────────────────

async function extractProductFromPage(
  context: BrowserContext,
  entry: CurrentCrawlEntry
): Promise<CurrentProduct | null> {
  const page = await context.newPage()
  const evidence: CrawlEvidence = {
    pageUrl: entry.url,
    errors: [],
    attemptedPdfUrls: [],
  }

  try {
    await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await dismissCookieBanner(page)
    await page.waitForSelector('h1', { timeout: 10000 }).catch(() => {})
    await delay(1000)

    const pageData = await page.evaluate(() => {
      // h1: "{BRAND}\n  {Product Name} {CATALOG-NUMBER}"
      const h1Raw = document.querySelector('h1')?.innerText?.trim() || ''
      const lines = h1Raw.split('\n').map(l => l.trim()).filter(Boolean)
      const brandName = lines.length >= 2 ? lines[0] : ''
      const productLine = lines.length >= 2 ? lines.slice(1).join(' ').trim() : lines[0] || ''

      // Catalog number = last whitespace-separated token in productLine,
      // but only if it looks like a real catalog code (contains digits or hyphens).
      // Controls products (e.g. "Bluetooth® High Mount Outdoor Sensor Module") have no catalog
      // code in the title — fall back to productId in that case.
      const tokens = productLine.split(/\s+/).filter(Boolean)
      const lastToken = tokens.length > 0 ? tokens[tokens.length - 1] : ''
      const isCatalogCode = /[\d\-_]/.test(lastToken)
      const catalogCode = isCatalogCode ? lastToken : ''
      const displayName = (isCatalogCode && tokens.length > 1) ? tokens.slice(0, -1).join(' ') : productLine

      // Spec extraction — try table first (fixtures), then div-based pairs (controls)
      const rawSpecs: Record<string, string> = {}
      const firstTable = document.querySelector('table')
      if (firstTable) {
        firstTable.querySelectorAll('tr').forEach((row) => {
          const cells = row.querySelectorAll('td')
          if (cells.length >= 2) {
            const label = cells[0].textContent?.trim() || ''
            const value = cells[1].textContent?.replace(/\s+/g, ' ').trim() || ''
            if (label && value) rawSpecs[label] = value
          }
        })
      }

      // Fallback: div-based spec pairs (used by controls products)
      if (Object.keys(rawSpecs).length === 0) {
        document.querySelectorAll('div').forEach((div) => {
          const children = Array.from(div.children)
          if (
            children.length === 2 &&
            children[0].tagName === 'DIV' &&
            children[1].tagName === 'DIV' &&
            children[0].children.length === 0 &&
            children[1].children.length === 0
          ) {
            const label = (children[0] as HTMLElement).innerText?.trim() || ''
            const value = (children[1] as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() || ''
            if (label && value && label.length < 60 && !rawSpecs[label]) {
              rawSpecs[label] = value
            }
          }
        })
      }

      // Spec sheet PDF: cdn.currentlighting.com/site/specsheet/ anchors
      const specSheetLinks: Array<{ label: string; url: string }> = []
      const seenUrls = new Set<string>()
      document.querySelectorAll('a[href*="cdn.currentlighting.com/site/specsheet/"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href
        if (seenUrls.has(href)) return
        seenUrls.add(href)
        const text = a.textContent?.trim() || ''
        specSheetLinks.push({ label: text || 'Spec Sheet', url: href })
      })

      // Thumbnail: cdn.currentlighting.com/site/prodimage1200/
      let thumbnailUrl = ''
      const thumbImg = document.querySelector('img[src*="cdn.currentlighting.com/site/prodimage1200/"]') as HTMLImageElement | null
      if (thumbImg) thumbnailUrl = thumbImg.src

      return { brandName, displayName, catalogCode, rawSpecs, specSheetLinks, thumbnailUrl }
    })

    const { brandName, displayName, catalogCode, rawSpecs, specSheetLinks, thumbnailUrl } = pageData
    evidence.pageTitle = displayName || entry.productId
    evidence.crawlCatalogCandidate = catalogCode || entry.productId

    // Prefer the h1 catalog code; fall back to numeric productId
    const catalogNumber = catalogCode || entry.productId

    // ── Parse Specs ───────────────────────────────────────────────────────────
    const { specs: parsedSpecs, provenance: parsedProvenance } = parseCurrentSpecs(rawSpecs)
    const regexConfidence = computeOverallConfidence(parsedProvenance)
    evidence.extractionConfidence = regexConfidence

    let finalSpecs: Record<string, unknown> = parsedSpecs as Record<string, unknown>
    let finalProvenance: FieldProvenanceMap = parsedProvenance

    if (regexConfidence < 0.5 && Object.keys(rawSpecs).length > 0) {
      console.log(`  [AI] Low confidence (${regexConfidence.toFixed(2)}) for ${catalogNumber}, running AI fallback...`)
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

    // ── Spec Sheet PDF ────────────────────────────────────────────────────────
    // Primary = link whose label contains "Specification Sheet" (not submittal)
    const primaryLink = specSheetLinks.find(s => /specification sheet/i.test(s.label))
      ?? specSheetLinks.find(s => !/submittal/i.test(s.label))
      ?? specSheetLinks[0]
      ?? null

    let specSheetPath: string | undefined
    let resolvedSpecSheetUrl: string | undefined

    const cachedPath = getSpecSheetPath('current', entry.productId)
    if (cachedPath) {
      specSheetPath = cachedPath
      evidence.pdfDownloadSuccess = true
      evidence.discoveredPdfUrl = 'cached'
    } else if (primaryLink) {
      evidence.attemptedPdfUrls!.push(primaryLink.url)
      const pdfResult = await withRetryOrNull(() => downloadValidPdf(primaryLink.url), { label: `pdf ${catalogNumber}` })
      if (pdfResult) {
        specSheetPath = saveSpecSheet('current', entry.productId, pdfResult.buffer)
        resolvedSpecSheetUrl = pdfResult.resolvedUrl
        evidence.discoveredPdfUrl = pdfResult.resolvedUrl
        evidence.pdfDownloadSuccess = true
        console.log(`  [PDF] Downloaded: ${primaryLink.url}`)
      } else {
        evidence.pdfDownloadSuccess = false
        resolvedSpecSheetUrl = primaryLink.url
        evidence.errors!.push(`PDF download failed: ${primaryLink.url}`)
        console.warn(`  [PDF] Not found for product ${catalogNumber}`)
      }
    } else {
      evidence.pdfDownloadSuccess = false
      console.warn(`  [PDF] No spec sheet URL for ${catalogNumber}`)
    }

    const specSheets: Array<{ label: string; url: string; path?: string }> =
      specSheetLinks.map((s, i) => ({
        label: s.label,
        url: s.url,
        path: i === 0 && primaryLink?.url === s.url ? specSheetPath : undefined,
      }))

    // ── Thumbnail ─────────────────────────────────────────────────────────────
    // Use catalogNumber (not productId) so getThumbnailUrl(slug, catalogNumber) finds the file
    const thumbPath = getThumbnailPath('current', catalogNumber)
    if (thumbnailUrl && !fs.existsSync(thumbPath)) {
      const imgBuf = await withRetryOrNull(() => downloadImageBuffer(thumbnailUrl), { label: `image ${catalogNumber}` })
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
      displayName: displayName || `Current Product ${entry.productId}`,
      familyName: undefined,
      brandName: brandName || undefined,
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
    console.error(`[Current] Failed for ${entry.url}:`, message)
    return null
  } finally {
    await page.close()
  }
}

// ─── Main Crawl Entry Point ───────────────────────────────────────────────────

export async function crawlCurrent(
  rootCategoriesToCrawl: string[] = Object.keys(CURRENT_ROOT_CATEGORY_PATHS)
): Promise<CurrentProduct[]> {
  console.log('[Current Crawler] Starting...')
  console.log(`[Current Crawler] Categories: ${rootCategoriesToCrawl.join(', ')}`)

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
  })

  try {
    // Collect all entries, deduplicating by productId (first-claim wins).
    // This prevents a product appearing under multiple subcategory listings from being extracted twice.
    const entryMap = new Map<string, CurrentCrawlEntry>()
    const listPage = await context.newPage()

    for (const rootSlug of rootCategoriesToCrawl) {
      const subcats = CURRENT_SUBCATEGORIES[rootSlug]
      if (!subcats) {
        console.warn(`[Current] Unknown root category: "${rootSlug}" — skipping`)
        continue
      }

      for (const sub of subcats) {
        console.log(`[Current] Scanning ${rootSlug}/${sub.slug}: ${sub.listingUrl}`)
        const found = await collectProductUrlsFromListingPage(listPage, sub.listingUrl)
        let added = 0
        for (const { url, productId } of found) {
          if (!entryMap.has(productId)) {
            entryMap.set(productId, {
              url,
              productId,
              rootSlug,
              subcategorySlug: sub.slug,
              subcategoryName: sub.name,
              subcategorySourceUrl: `${BASE_URL}${sub.listingUrl}`,
            })
            added++
          }
        }
        console.log(`[Current] ${rootSlug}/${sub.slug}: ${added} unique products queued (${found.length} found)`)
        await delay(500)
      }
    }

    await listPage.close()

    const allEntries = [...entryMap.values()]
    if (allEntries.length === 0) {
      console.warn('[Current] No product URLs found — check listing page structure')
      return []
    }

    console.log(`\n[Current] Processing ${allEntries.length} products total (concurrency=3)...`)
    const results: CurrentProduct[] = []
    let completed = 0
    const limit = pLimit(3)

    await Promise.all(
      allEntries.map((entry) =>
        limit(async () => {
          await delay(800)
          const product = await extractProductFromPage(context, entry)
          completed++
          process.stdout.write(`[${completed}/${allEntries.length}] ${entry.productId} ${product ? '✓' : '✗'}\n`)
          if (product) results.push(product)
        })
      )
    )

    const pdfCount = results.filter(r => r.crawlEvidence.pdfDownloadSuccess).length
    console.log(`\n[Current] Done. ${results.length} products | ${pdfCount} with PDFs`)
    return results
  } finally {
    await context.close()
    await browser.close()
  }
}
