import { chromium, Browser, BrowserContext, Page, APIRequestContext } from 'playwright'
import https from 'https'
import http from 'http'
import path from 'path'
import pLimit from 'p-limit'
import { extractByAI, computeOverallConfidence } from './parser'
import type { RawSpecs } from './parser'
import {
  normalizeVoltage,
  normalizeVoltageList,
  normalizeDimmingTypes,
  normalizeMountingTypes,
  normalizeFormFactor,
  pickBestSpecSheet,
} from './normalize'
import { saveSpecSheet, getSpecSheetPath } from '../storage'
import { getThumbnailPath } from '../thumbnails'
import type { CrawlEvidence, FieldProvenanceMap } from '../types'
import fs from 'fs'
import { withRetryOrNull } from './retry'

const BASE_URL = 'https://www.acuitybrands.com'

// ─── Category path mapping ────────────────────────────────────────────────────
// Maps our seeded Category.slug → Acuity's landing page path.
// Landing pages contain subcategory tiles that link to Coveo product listing pages.

export const ACUITY_ROOT_CATEGORY_PATHS: Record<string, string> = {
  'indoor':                 '/products/indoor',
  'outdoor':                '/products/outdoor',
  'residential':            '/products/residential',
  'industrial':             '/products/industrial',
  'life-safety':            '/products/life-safety',
  'confinement-vandal':     '/products/confinement-vandal',
  'controls':               '/products/controls',
  'downlights':             '/products/downlights',
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Internal: product URL tagged with its category context
interface AcuityCrawlEntry {
  url: string
  rootSlug: string           // our DB category slug (e.g. 'indoor')
  subcategorySlug: string    // sub-category slug (e.g. 'troffers')
  subcategoryName: string    // display name (e.g. 'Troffers')
  subcategorySourceUrl: string
}

// Uses same field names as EliteProduct for categoryFamily fields
// so upsertProduct() in crawl.ts works without changes.
export interface AcuityProduct {
  productId: string
  catalogNumber: string          // = productId (stable numeric ID from URL)
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
  categoryFamilySlug?: string    // = subcategorySlug
  categoryFamilyName?: string    // = subcategoryName
  categoryFamilySourceUrl?: string
}

const STEALTH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Dismiss cookie/GDPR consent banners (OneTrust and common patterns)
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

async function downloadValidPdf(url: string, request?: APIRequestContext): Promise<PdfResult | null> {
  // Prefer Playwright's request context (carries session cookies) over bare HTTPS
  if (request) {
    try {
      const resp = await request.get(url, {
        headers: {
          'Accept': 'application/pdf,*/*',
          'Referer': 'https://www.acuitybrands.com/',
        },
        timeout: 25000,
      })
      if (resp.status() !== 200) return null
      const buf = Buffer.from(await resp.body())
      if (buf.length < 1000 || buf.slice(0, 4).toString('ascii') !== '%PDF') return null
      const filename = path.basename(new URL(url).pathname).replace(/\.pdf$/i, '')
      return { buffer: buf, resolvedUrl: url, filename }
    } catch {
      return null
    }
  }

  // Fallback: bare HTTPS (no session cookies)
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const chunks: Buffer[] = []
    const req = protocol.get(url, {
      headers: {
        'User-Agent': STEALTH_UA,
        'Accept': 'application/pdf,*/*',
        'Referer': 'https://www.acuitybrands.com/',
      },
    }, (res) => {
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

// ─── Category Discovery ───────────────────────────────────────────────────────

// Navigate Acuity's category landing page and discover subcategory links dynamically.
// Filters out external subdomain links (juno.acuitybrands.com, etc.) — www only.
async function discoverSubcategoriesFromLandingPage(
  context: BrowserContext,
  rootSlug: string,
  landingPath: string
): Promise<Array<{ slug: string; name: string; url: string }>> {
  const page = await context.newPage()
  const subcategories: Array<{ slug: string; name: string; url: string }> = []

  try {
    const landingUrl = `${BASE_URL}${landingPath}`
    console.log(`[Acuity] Scanning ${rootSlug}: ${landingUrl}`)
    await page.goto(landingUrl, { waitUntil: 'load', timeout: 45000 })
    await dismissCookieBanner(page)
    // Wait for the SPA to bootstrap and render navigation links
    await page.waitForSelector('a[href*="/products/"]', { timeout: 15000 }).catch(() => {})
    await delay(4000)

    const links = await page.evaluate((rootSl: string) => {
      const baseUrl = 'https://www.acuitybrands.com'
      const seen = new Set<string>()
      const results: Array<{ slug: string; name: string; url: string }> = []

      document.querySelectorAll('a[href]').forEach((el) => {
        const a = el as HTMLAnchorElement
        const href = a.getAttribute('href') || ''
        const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`

        // Must be on www.acuitybrands.com (not subdomains like juno, marklighting, etc.)
        let hostname = ''
        let urlPath = ''
        try {
          const parsed = new URL(fullUrl)
          hostname = parsed.hostname
          urlPath = parsed.pathname
        } catch { return }
        if (hostname !== 'www.acuitybrands.com' && hostname !== 'acuitybrands.com') return

        // Must match /products/{rootSlug}/{subcatSlug} — exactly two segments after /products/
        const pattern = new RegExp(`^/products/${rootSl}/([^/?#]+)/?$`)
        const match = urlPath.match(pattern)
        if (!match) return

        const slug = match[1]
        if (seen.has(slug)) return
        seen.add(slug)

        // Name from link text or nearest heading inside a card/tile container
        const linkText = a.textContent?.trim() || ''
        const card = a.closest('[class*="card"], [class*="tile"], [class*="category"], li, article')
        const heading = card?.querySelector('h2, h3, h4, h5, [class*="title"], [class*="name"]')?.textContent?.trim() || ''
        const name = heading || linkText || slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

        results.push({ slug, name, url: `${baseUrl}/products/${rootSl}/${slug}` })
      })

      return results
    }, rootSlug)

    if (links && links.length > 0) {
      subcategories.push(...links)
      console.log(`[Acuity] ${rootSlug}: found ${links.length} subcategories`)
    } else {
      console.log(`[Acuity] ${rootSlug}: no subcategories found, using root as product listing`)
    }
  } catch (err) {
    console.error(`[Acuity] Failed to discover subcategories for ${rootSlug}:`, err)
  } finally {
    await page.close()
  }

  return subcategories
}

// ─── Product URL Collection (Infinite Scroll) ─────────────────────────────────

// Navigate a Coveo-powered product listing page and scroll until all products load.
// Acuity uses infinite scroll — products load in batches as user scrolls down.
async function collectProductUrlsFromSubcategoryPage(
  page: Page,
  categoryUrl: string
): Promise<string[]> {
  try {
    await page.goto(categoryUrl, { waitUntil: 'load', timeout: 45000 })
    await dismissCookieBanner(page)

    // Wait for Coveo to render product cards — fires after initial load event
    await page.waitForSelector('a[href*="/products/detail/"]', { timeout: 20000 }).catch(() => {})
    await delay(3000)

    // Scroll loop: keep scrolling until product count stops increasing for 2 consecutive checks
    let prevCount = 0
    let stableRounds = 0

    while (stableRounds < 2) {
      const currentCount: number = await page.evaluate(() => {
        const urls = new Set<string>()
        document.querySelectorAll('a[href*="/products/detail/"]').forEach((el) => {
          const href = (el as HTMLAnchorElement).href
          if (href && !href.includes('#')) urls.add(href)
        })
        return urls.size
      })

      if (currentCount === prevCount) {
        stableRounds++
      } else {
        stableRounds = 0
        prevCount = currentCount
      }

      if (stableRounds < 2) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await delay(2500)
      }
    }

    const urls: string[] = await page.evaluate(() => {
      const urlSet = new Set<string>()
      document.querySelectorAll('a[href*="/products/detail/"]').forEach((el) => {
        const href = (el as HTMLAnchorElement).href
        if (href && !href.includes('#')) urlSet.add(href)
      })
      return [...urlSet]
    })

    console.log(`[Acuity]   ${categoryUrl}: ${urls.length} products`)
    return urls
  } catch (err) {
    console.error(`[Acuity] Failed to collect product URLs from ${categoryUrl}:`, err)
    return []
  }
}

// ─── Spec Parsing (Direct Table Mapping) ──────────────────────────────────────

// Maps Acuity's structured HTML spec table directly to RawSpecs fields.
// High confidence (0.95) since structured data is more reliable than regex on free text.
function parseAcuitySpecs(
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
  const lumensRaw = get('Lumens', 'lumens', 'Lumen Output')
  if (lumensRaw) {
    // Parse values like "3000 LM, 4000 LM, 5000 LM" or "3000, 4000"
    const withUnit = [...lumensRaw.matchAll(/(\d[\d,]*)\s*(?:lm|LM|lumens?)/gi)]
      .map(m => parseInt(m[1].replace(/,/g, '')))
      .filter(n => !isNaN(n))

    const plainNums = withUnit.length > 0
      ? withUnit
      : lumensRaw.split(/[,;]/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 100)

    if (plainNums.length === 1) {
      specs.lumens = plainNums[0]
      provenance.lumens = fp(lumensRaw)
    } else if (plainNums.length > 1) {
      specs.lumensMin = Math.min(...plainNums)
      specs.lumensMax = Math.max(...plainNums)
      provenance.lumensMin = fp(lumensRaw)
      provenance.lumensMax = fp(lumensRaw)
    }
  }

  // ── CCT ─────────────────────────────────────────────────────────────────────
  const cctRaw = get('CCT / LED Color', 'CCT', 'Color Temperature', 'cct')
  if (cctRaw) {
    const cctValues = [...cctRaw.matchAll(/(\d{4})\s*[Kk]/g)].map(m => parseInt(m[1]))
    if (cctValues.length > 0) {
      specs.cctOptions = [...new Set(cctValues)].sort()
      provenance.cctOptions = fp(cctRaw)
    }
  }

  // ── CRI ─────────────────────────────────────────────────────────────────────
  const criRaw = get('CRI', 'Color Rendering Index', 'cri')
  if (criRaw) {
    const allCri = criRaw.match(/\d{2,3}/g)?.map(Number) ?? []
    if (allCri.length > 0) {
      specs.cri = Math.min(...allCri) // multiple options → take minimum (most common)
      provenance.cri = fp(criRaw)
    }
  }

  // ── Wattage ──────────────────────────────────────────────────────────────────
  const wattRaw = get('Fixture Wattage', 'Wattage', 'Input Watts', 'wattage')
  if (wattRaw) {
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

  // ── Voltage ──────────────────────────────────────────────────────────────────
  const voltRaw = get('Voltage Rating', 'Voltage', 'Input Voltage', 'voltage')
  if (voltRaw) {
    const bestVoltage = normalizeVoltageList(voltRaw)
    specs.voltage = bestVoltage ?? voltRaw.split(/[,;]/)[0].trim()
    provenance.voltage = bestVoltage ? fp(voltRaw) : fpLow(voltRaw)
  }

  // ── Dimming ──────────────────────────────────────────────────────────────────
  const dimmingRaw = get('Dimming Protocol', 'Dimming', 'Control', 'dimming')
  if (dimmingRaw) {
    const types = normalizeDimmingTypes(dimmingRaw)
    if (types.length > 0) {
      specs.dimmable = true
      specs.dimmingType = dimmingRaw.trim()
      provenance.dimmable = fp(dimmingRaw)
      provenance.dimmingType = fp(dimmingRaw)
    } else if (/dim|0.?10/i.test(dimmingRaw)) {
      specs.dimmable = true
      specs.dimmingType = dimmingRaw.trim()
      provenance.dimmable = fpLow(dimmingRaw)
      provenance.dimmingType = fpLow(dimmingRaw)
    }
  }

  // ── Mounting ─────────────────────────────────────────────────────────────────
  const mountRaw = get('Mounting Type', 'Mounting', 'mounting')
  if (mountRaw) {
    const types = normalizeMountingTypes(mountRaw)
    specs.mountingType = mountRaw.trim()
    provenance.mountingType = types.length > 0 ? fp(mountRaw) : fpLow(mountRaw)
  }

  // ── Environmental (Wet / Damp) ────────────────────────────────────────────────
  const envRaw = get('Environmental Listing', 'Environmental', 'Location Rating', 'Location')
  if (envRaw) {
    if (/\bwet\b/i.test(envRaw)) {
      specs.wetLocation = true
      provenance.wetLocation = fp(envRaw)
    } else if (/\bdamp\b/i.test(envRaw)) {
      specs.dampLocation = true
      provenance.dampLocation = fp(envRaw)
    }
  }

  // ── UL / CSA Listed ─────────────────────────────────────────────────────────
  const regRaw = get('Regulatory Listing', 'Regulatory', 'Certifications', 'Listings')
  if (regRaw && /\bUL\b|CSA|ETL/i.test(regRaw)) {
    specs.ulListed = true
    provenance.ulListed = fp(regRaw)
  }

  // ── DLC ─────────────────────────────────────────────────────────────────────
  if (/DLC\s*Premium/i.test(regRaw)) {
    specs.dlcListed = true
    specs.dlcPremium = true
    provenance.dlcListed = fp(regRaw)
    provenance.dlcPremium = fp(regRaw)
  } else if (/\bDLC\b|DesignLights/i.test(regRaw)) {
    specs.dlcListed = true
    specs.dlcPremium = false
    provenance.dlcListed = fp(regRaw)
    provenance.dlcPremium = fp(regRaw)
  }

  // ── Form Factor (from Size field) ────────────────────────────────────────────
  const sizeRaw = get('Size', 'size', 'Fixture Size')
  if (sizeRaw) {
    const firstSize = sizeRaw.split(/[,;]/)[0].trim()
    specs.formFactor = normalizeFormFactor(firstSize)
    provenance.formFactor = fp(sizeRaw)
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

  // ── NEMA Rating ──────────────────────────────────────────────────────────────
  const nemaRaw = get('NEMA Rating', 'NEMA')
  if (nemaRaw) {
    const nemaMatch = nemaRaw.match(/NEMA\s*(\d+[A-Z]?(?:\/\d+[A-Z]?)*)/i)
    if (nemaMatch) {
      specs.nemaRating = `NEMA ${nemaMatch[1]}`
      provenance.nemaRating = fp(nemaRaw)
    }
  }

  // ── Emergency Backup ─────────────────────────────────────────────────────────
  const emergRaw = get('Emergency', 'Emergency Backup', 'emergency')
  if (emergRaw && /yes|included|battery|backup|em/i.test(emergRaw)) {
    specs.emergencyBackup = true
    provenance.emergencyBackup = fp(emergRaw)
  }

  // ── Efficacy (LPW) ───────────────────────────────────────────────────────────
  const efficacyRaw = get('Efficacy', 'LPW', 'Lumens Per Watt', 'efficacy')
  if (efficacyRaw) {
    const match = efficacyRaw.match(/(\d+(?:\.\d+)?)/)
    if (match) {
      specs.efficacy = parseFloat(match[1])
      provenance.efficacy = fp(efficacyRaw)
    }
  }

  return { specs, provenance }
}

// ─── Per-Product Extraction ───────────────────────────────────────────────────

async function extractProductFromPage(
  context: BrowserContext,
  entry: AcuityCrawlEntry
): Promise<AcuityProduct | null> {
  const page = await context.newPage()
  const evidence: CrawlEvidence = {
    pageUrl: entry.url,
    errors: [],
    attemptedPdfUrls: [],
  }

  try {
    await page.goto(entry.url, { waitUntil: 'load', timeout: 45000 })
    await dismissCookieBanner(page)
    // Wait for product detail content (h1) to render
    await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {})
    await delay(2000)

    // Extract product ID from URL: /products/detail/{ID}/...
    const productIdMatch = entry.url.match(/\/products\/detail\/(\d+)\//)
    if (!productIdMatch) {
      throw new Error(`Cannot extract product ID from URL: ${entry.url}`)
    }
    const productId = productIdMatch[1]
    evidence.crawlCatalogCandidate = productId

    // Extract static page data (h1, description, brand, hero image, spec sheet link)
    const pageData = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.textContent?.trim() || ''

      // Description: first non-empty text sibling after h1
      let description = ''
      const h1El = document.querySelector('h1')
      const parent = h1El?.parentElement
      if (parent) {
        const siblings = Array.from(parent.children)
        const h1Idx = siblings.indexOf(h1El!)
        for (let i = h1Idx + 1; i < siblings.length; i++) {
          const text = siblings[i].textContent?.trim() || ''
          if (text && text.length > 5 && text.length < 300 && !text.includes('\n\n')) {
            description = text
            break
          }
        }
      }

      // Brand: from brand/logo images
      let brandName = ''
      document.querySelectorAll('img[alt]').forEach((img) => {
        if (brandName) return
        const alt = (img as HTMLImageElement).alt || ''
        const src = (img as HTMLImageElement).src || ''
        if ((src.includes('brand') || src.includes('logo') || src.includes('manufacturer'))
          && alt && alt.length > 1 && alt.length < 60) {
          brandName = alt
        }
      })

      // Hero image: first catalog asset image
      let heroImageUrl = ''
      document.querySelectorAll('img[src*="img.acuitybrands.com/public-assets/catalog/"]').forEach((img) => {
        if (!heroImageUrl) heroImageUrl = (img as HTMLImageElement).src
      })

      // Spec sheets: collect ALL unique SPEC_SHEET links with labels
      const specSheetLinks: Array<{ label: string; url: string }> = []
      const seenUrls = new Set<string>()
      document.querySelectorAll('a[href*="/api/products/getasset/"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href
        if (!href.includes('DOC_Type=SPEC_SHEET') || href.includes('&attachment=true')) return
        if (seenUrls.has(href)) return
        seenUrls.add(href)
        // Try to get a meaningful label from anchor text or nearby heading
        const text = (a.textContent || '').trim()
        const label = text || 'Spec Sheet'
        specSheetLinks.push({ label, url: href })
      })

      return { h1, description, brandName, heroImageUrl, specSheetLinks }
    })

    evidence.pageTitle = pageData.h1

    // ── Specifications Tab ────────────────────────────────────────────────────
    let rawSpecs: Record<string, string> = {}
    let dlcPremium = false
    let dlcListed = false
    let ulListed = false

    try {
      // Click the Specifications tab
      const specTabs = await page.$$('[role="tab"]')
      for (const tab of specTabs) {
        const text = await tab.textContent()
        if (text && /spec/i.test(text)) {
          await tab.click()
          await delay(1000)
          break
        }
      }

      await page.waitForSelector('table tr', { timeout: 5000 }).catch(() => {})

      rawSpecs = await page.evaluate(() => {
        const result: Record<string, string> = {}
        document.querySelectorAll('table tr').forEach((row) => {
          const cells = row.querySelectorAll('td, th')
          if (cells.length >= 2) {
            const label = cells[0].textContent?.trim() || ''
            const value = cells[1].textContent?.trim() || ''
            if (label && value) result[label] = value
          }
        })
        return result
      })

      // Certification badges from page images
      const certData = await page.evaluate(() => {
        let dlcPremium = false, dlcListed = false, ulListed = false
        document.querySelectorAll('img[alt]').forEach((img) => {
          const alt = ((img as HTMLImageElement).alt || '').toLowerCase()
          if (alt.includes('dlc premium')) { dlcPremium = true; dlcListed = true }
          else if (alt.includes('dlc')) dlcListed = true
          if (alt.includes('ul listed') || alt.includes('culuss') || /\bcul\b/.test(alt)) ulListed = true
        })
        return { dlcPremium, dlcListed, ulListed }
      })
      dlcPremium = certData.dlcPremium
      dlcListed = certData.dlcListed
      ulListed = certData.ulListed
    } catch (err) {
      evidence.errors!.push(`Spec tab extraction failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    // ── Parse Specs ───────────────────────────────────────────────────────────
    const { specs: parsedSpecs, provenance: parsedProvenance } = parseAcuitySpecs(rawSpecs)

    // Apply badge-based overrides (badges are authoritative — higher confidence than table text)
    if (dlcPremium) {
      parsedSpecs.dlcPremium = true
      parsedSpecs.dlcListed = true
      parsedProvenance.dlcPremium = { source: 'REGEX', confidence: 0.98, rawValue: 'DLC Premium badge' }
      parsedProvenance.dlcListed = { source: 'REGEX', confidence: 0.98, rawValue: 'DLC Premium badge' }
    } else if (dlcListed) {
      parsedSpecs.dlcListed = true
      parsedProvenance.dlcListed = { source: 'REGEX', confidence: 0.98, rawValue: 'DLC badge' }
    }
    if (ulListed) {
      parsedSpecs.ulListed = true
      parsedProvenance.ulListed = { source: 'REGEX', confidence: 0.98, rawValue: 'UL badge' }
    }

    let finalSpecs: Record<string, unknown> = parsedSpecs as Record<string, unknown>
    let finalProvenance: FieldProvenanceMap = parsedProvenance

    const regexConfidence = computeOverallConfidence(parsedProvenance)
    evidence.extractionConfidence = regexConfidence

    // AI fallback if structured table extraction confidence is still low
    if (regexConfidence < 0.5 && Object.keys(rawSpecs).length > 0) {
      console.log(`  [AI] Low confidence (${regexConfidence.toFixed(2)}) for ${productId}, running AI fallback...`)
      const specText = Object.entries(rawSpecs)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
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
    let specSheetPath: string | undefined
    let resolvedSpecSheetUrl: string | undefined

    // Primary spec sheet = best match for this product (not an accessory, own-product URL)
    const primaryLink = pickBestSpecSheet(pageData.specSheetLinks ?? [], productId)
    const cachedPath = getSpecSheetPath('acuity', productId)
    if (cachedPath) {
      specSheetPath = cachedPath
      evidence.pdfDownloadSuccess = true
      evidence.discoveredPdfUrl = 'cached'
    } else if (primaryLink) {
      evidence.attemptedPdfUrls!.push(primaryLink.url)
      const pdfResult = await withRetryOrNull(() => downloadValidPdf(primaryLink.url, context.request), { label: `pdf ${productId}` })
      if (pdfResult) {
        specSheetPath = saveSpecSheet('acuity', productId, pdfResult.buffer)
        resolvedSpecSheetUrl = pdfResult.resolvedUrl
        evidence.discoveredPdfUrl = pdfResult.resolvedUrl
        evidence.pdfDownloadSuccess = true
        console.log(`  [PDF] Downloaded: ${primaryLink.url}`)
      } else {
        evidence.pdfDownloadSuccess = false
        resolvedSpecSheetUrl = primaryLink.url  // Preserve URL for backfill
        evidence.errors!.push(`PDF download failed: ${primaryLink.url}`)
        console.warn(`  [PDF] Not found for product ${productId}`)
      }
    } else {
      evidence.pdfDownloadSuccess = false
      console.warn(`  [PDF] No spec sheet URL found for product ${productId}`)
    }

    // Build specSheets array: primary + additional links (URL only; paths filled by backfill)
    const specSheets: Array<{ label: string; url: string; path?: string }> =
      (pageData.specSheetLinks ?? []).map((s, i) => ({
        label: s.label,
        url: s.url,
        path: i === 0 ? specSheetPath : undefined,
      }))

    // ── Thumbnail Image ───────────────────────────────────────────────────────
    const thumbPath = getThumbnailPath('acuity', productId)
    if (pageData.heroImageUrl && !fs.existsSync(thumbPath)) {
      const imgBuf = await withRetryOrNull(() => downloadImageBuffer(pageData.heroImageUrl), { label: `image ${productId}` })
      if (imgBuf) {
        const thumbDir = path.dirname(thumbPath)
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })
        fs.writeFileSync(thumbPath, imgBuf)
      }
    }

    evidence.parseMethod = 'html_only'  // Acuity: spec table extraction, not PDF text parsing
    evidence.fieldCountExtracted = Object.keys(finalProvenance).length

    const displayName = pageData.h1 || `Acuity Product ${productId}`
    const familyName = pageData.description || (rawSpecs['Product Type'] ?? undefined)

    return {
      productId,
      catalogNumber: productId,
      displayName,
      familyName,
      brandName: pageData.brandName || undefined,
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
    console.error(`[Acuity] Failed for ${entry.url}:`, message)
    return null
  } finally {
    await page.close()
  }
}

// ─── Main Crawl Entry Point ───────────────────────────────────────────────────

export async function crawlAcuity(
  rootCategoriesToCrawl: string[] = Object.keys(ACUITY_ROOT_CATEGORY_PATHS)
): Promise<AcuityProduct[]> {
  console.log('[Acuity Crawler] Starting...')
  console.log(`[Acuity Crawler] Categories: ${rootCategoriesToCrawl.join(', ')}`)

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor',
    ],
  })

  // BrowserContext with stealth UA and headers — avoids headless detection by Coveo
  const context = await browser.newContext({
    userAgent: STEALTH_UA,
    viewport: { width: 1366, height: 768 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  })

  // Remove navigator.webdriver fingerprint that headless Chrome exposes
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    // @ts-ignore
    if (!window.chrome) window.chrome = { runtime: {}, app: {} }
  })

  try {
    const allEntries: AcuityCrawlEntry[] = []
    const seenUrls = new Set<string>()

    for (const rootSlug of rootCategoriesToCrawl) {
      const landingPath = ACUITY_ROOT_CATEGORY_PATHS[rootSlug]
      if (!landingPath) {
        console.warn(`[Acuity] Unknown root category slug: "${rootSlug}" — skipping`)
        continue
      }

      const subcategories = await discoverSubcategoriesFromLandingPage(context, rootSlug, landingPath)

      // If no subcategories found, treat the root landing page itself as a product listing
      const sources = subcategories.length > 0
        ? subcategories
        : [{
          slug: rootSlug,
          name: rootSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          url: `${BASE_URL}${landingPath}`,
        }]

      // Reuse a single page per root category for product URL collection (saves browser overhead)
      const listPage = await context.newPage()
      for (const sub of sources) {
        const productUrls = await collectProductUrlsFromSubcategoryPage(listPage, sub.url)
        let addedCount = 0
        for (const url of productUrls) {
          if (!seenUrls.has(url)) {
            seenUrls.add(url)
            allEntries.push({
              url,
              rootSlug,
              subcategorySlug: sub.slug,
              subcategoryName: sub.name,
              subcategorySourceUrl: sub.url,
            })
            addedCount++
          }
        }
        console.log(`[Acuity] ${rootSlug}/${sub.slug}: ${addedCount} unique products queued`)
        await delay(1000)
      }
      await listPage.close()
    }

    if (allEntries.length === 0) {
      console.warn('[Acuity] No product URLs found — check acuitybrands.com structure')
      return []
    }

    console.log(`\n[Acuity] Processing ${allEntries.length} products total (concurrency=3)...`)
    const results: AcuityProduct[] = []
    let completed = 0
    const limit = pLimit(3)

    await Promise.all(
      allEntries.map((entry) =>
        limit(async () => {
          await delay(1000) // polite delay between product requests
          const product = await extractProductFromPage(context, entry)
          completed++
          console.log(`[${completed}/${allEntries.length}] ${entry.url}`)
          if (product) results.push(product)
        })
      )
    )

    const pdfCount = results.filter((r) => r.crawlEvidence.pdfDownloadSuccess).length
    console.log(`\n[Acuity] Done. ${results.length} products | ${pdfCount} with PDFs`)
    return results
  } finally {
    await context.close()
    await browser.close()
  }
}
