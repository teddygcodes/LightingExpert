import { chromium, BrowserContext, Page, APIRequestContext } from 'playwright'
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
  'contractor-select': 'contractor-select',
}

const STEALTH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Cookie Banner ────────────────────────────────────────────────────────────

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

// ─── CS Category Discovery ────────────────────────────────────────────────────

async function discoverCSCategoryPages(
  context: BrowserContext
): Promise<Array<{ slug: string; name: string; url: string }>> {
  const page = await context.newPage()
  const results: Array<{ slug: string; name: string; url: string }> = []

  try {
    console.log(`[AcuityCS] Loading CS landing page: ${CS_LANDING_URL}`)
    await page.goto(CS_LANDING_URL, { waitUntil: 'load', timeout: 45000 })
    await dismissCookieBanner(page)
    await page.waitForSelector('a[href*="/products/"]', { timeout: 15000 }).catch(() => {})
    await delay(4000)

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

// ─── Product URL Collection (Infinite Scroll) ─────────────────────────────────

async function collectProductUrlsFromSubcategoryPage(
  page: Page,
  categoryUrl: string
): Promise<string[]> {
  try {
    await page.goto(categoryUrl, { waitUntil: 'load', timeout: 45000 })
    await dismissCookieBanner(page)

    await page.waitForSelector('a[href*="/products/detail/"]', { timeout: 20000 }).catch(() => {})
    await delay(3000)

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

    console.log(`[AcuityCS]   ${categoryUrl}: ${urls.length} products`)
    return urls
  } catch (err) {
    console.error(`[AcuityCS] Failed to collect product URLs from ${categoryUrl}:`, err)
    return []
  }
}

// ─── Spec Parsing (Direct Table Mapping) ──────────────────────────────────────

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
      specs.cri = Math.min(...allCri)
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
    const tokens = voltRaw.split(/[,;]/).map(s => s.trim())
    const matched = tokens.find(tok => normalizeVoltage(tok) !== undefined)
    specs.voltage = (matched ?? tokens[0]).trim()
    provenance.voltage = matched ? fp(voltRaw) : fpLow(voltRaw)
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
  entry: AcuityCSCrawlEntry
): Promise<AcuityCsProduct | null> {
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
    await delay(2000)

    const productIdMatch = entry.url.match(/\/products\/detail\/(\d+)\//)
    if (!productIdMatch) {
      throw new Error(`Cannot extract product ID from URL: ${entry.url}`)
    }
    const productId = productIdMatch[1]
    evidence.crawlCatalogCandidate = productId

    const pageData = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.textContent?.trim() || ''

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

      let heroImageUrl = ''
      document.querySelectorAll('img[src*="img.acuitybrands.com/public-assets/catalog/"]').forEach((img) => {
        if (!heroImageUrl) heroImageUrl = (img as HTMLImageElement).src
      })

      const specSheetLinks: Array<{ label: string; url: string }> = []
      const seenUrls = new Set<string>()
      document.querySelectorAll('a[href*="/api/products/getasset/"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href
        if (!href.includes('DOC_Type=SPEC_SHEET') || href.includes('&attachment=true')) return
        if (seenUrls.has(href)) return
        seenUrls.add(href)
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

    const primaryLink = pageData.specSheetLinks?.[0] ?? null
    const cachedPath = getSpecSheetPath('acuity-cs', productId)
    if (cachedPath) {
      specSheetPath = cachedPath
      evidence.pdfDownloadSuccess = true
      evidence.discoveredPdfUrl = 'cached'
    } else if (primaryLink) {
      evidence.attemptedPdfUrls!.push(primaryLink.url)
      const pdfResult = await downloadValidPdf(primaryLink.url, context.request)
      if (pdfResult) {
        specSheetPath = saveSpecSheet('acuity-cs', productId, pdfResult.buffer)
        resolvedSpecSheetUrl = pdfResult.resolvedUrl
        evidence.discoveredPdfUrl = pdfResult.resolvedUrl
        evidence.pdfDownloadSuccess = true
        console.log(`  [PDF] Downloaded: ${primaryLink.url}`)
      } else {
        evidence.pdfDownloadSuccess = false
        resolvedSpecSheetUrl = primaryLink.url
        evidence.errors!.push(`PDF download failed: ${primaryLink.url}`)
        console.warn(`  [PDF] Not found for product ${productId}`)
      }
    } else {
      evidence.pdfDownloadSuccess = false
      console.warn(`  [PDF] No spec sheet URL found for product ${productId}`)
    }

    const specSheets: Array<{ label: string; url: string; path?: string }> =
      (pageData.specSheetLinks ?? []).map((s, i) => ({
        label: s.label,
        url: s.url,
        path: i === 0 ? specSheetPath : undefined,
      }))

    // ── Thumbnail Image ───────────────────────────────────────────────────────
    const thumbPath = getThumbnailPath('acuity-cs', productId)
    if (pageData.heroImageUrl && !fs.existsSync(thumbPath)) {
      const imgBuf = await downloadImageBuffer(pageData.heroImageUrl)
      if (imgBuf) {
        const thumbDir = path.dirname(thumbPath)
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })
        fs.writeFileSync(thumbPath, imgBuf)
      }
    }

    evidence.parseMethod = 'html_only'
    evidence.fieldCountExtracted = Object.keys(finalProvenance).length

    const displayName = pageData.h1 || `Acuity CS Product ${productId}`
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
    console.error(`[AcuityCS] Failed for ${entry.url}:`, message)
    return null
  } finally {
    await page.close()
  }
}

// ─── Main Crawl Entry Point ───────────────────────────────────────────────────

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

    const categories = await discoverCSCategoryPages(context)

    if (categories.length === 0) {
      console.warn('[AcuityCS] No category pages discovered — check CS landing page structure')
      return []
    }

    const listPage = await context.newPage()
    for (const cat of categories) {
      const productUrls = await collectProductUrlsFromSubcategoryPage(listPage, cat.url)
      let added = 0
      for (const url of productUrls) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url)
          allEntries.push({
            url,
            rootSlug: 'contractor-select',        // fixed: always under contractor-select
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
