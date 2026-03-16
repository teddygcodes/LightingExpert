/**
 * Backfill spec sheet PDFs for Acuity products that have a specSheetUrl but no specSheetPath.
 * Uses Playwright with --disable-pdf-viewer + acceptDownloads to capture PDFs as file downloads
 * (bypasses Cloudflare which blocks programmatic requests but allows real browser navigation).
 * Run with: npx ts-node --project tsconfig.scripts.json scripts/backfill-acuity-pdfs.ts
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ override: true })

import { chromium, Browser, BrowserContext } from 'playwright'
import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const prisma = new PrismaClient()

const STEALTH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

// Recycle the browser context every N products to avoid memory leaks
const CONTEXT_RECYCLE_INTERVAL = 50

function saveSpecSheet(catalogNumber: string, srcPath: string): string {
  const safeCatalog = catalogNumber.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
  const dir = path.join(process.cwd(), 'public', 'spec-sheets', 'acuity')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const destPath = path.join(dir, `${safeCatalog}.pdf`)
  fs.copyFileSync(srcPath, destPath)
  return `/spec-sheets/acuity/${safeCatalog}.pdf`
}

async function createContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: STEALTH_UA,
    viewport: { width: 1366, height: 768 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  // Warm up: visit homepage to acquire session cookies
  const warmupPage = await context.newPage()
  await warmupPage
    .goto('https://www.acuitybrands.com/', { waitUntil: 'load', timeout: 30000 })
    .catch(() => {})
  await warmupPage.close()

  return context
}

async function downloadPdf(
  context: BrowserContext,
  url: string,
): Promise<{ tmpPath: string; size: number } | null> {
  const page = await context.newPage()
  try {
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })

    // goto throws "Download is starting" when --disable-pdf-viewer intercepts the PDF
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 }).catch(() => {})

    const download = await downloadPromise
    const failure = await download.failure()
    if (failure) return null

    const tmpPath = await download.path()
    if (!tmpPath) return null

    // Verify it's actually a PDF
    const buf = fs.readFileSync(tmpPath)
    if (buf.length < 1000 || buf.slice(0, 4).toString('ascii') !== '%PDF') return null

    return { tmpPath, size: buf.length }
  } catch {
    return null
  } finally {
    await page.close()
  }
}

async function main() {
  const acuity = await prisma.manufacturer.findUnique({ where: { slug: 'acuity' } })
  if (!acuity) { console.error('Acuity manufacturer not found'); process.exit(1) }

  type RawProduct = { id: string; catalogNumber: string; specSheetUrl: string | null; specSheets: unknown }
  const products = await prisma.product.findMany({
    where: {
      manufacturerId: acuity.id,
      specSheetUrl: { not: null },
      specSheetPath: null,
    },
    select: { id: true, catalogNumber: true, specSheetUrl: true, specSheets: true },
  }) as RawProduct[]

  console.log(`Found ${products.length} Acuity products needing PDF download`)
  if (products.length === 0) { console.log('Nothing to do.'); return }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-pdf-viewer',
      '--disable-blink-features=AutomationControlled',
    ],
  })

  let context = await createContext(browser)
  let downloaded = 0
  let failed = 0

  try {
    for (let i = 0; i < products.length; i++) {
      const p = products[i]
      const url = p.specSheetUrl!
      process.stdout.write(`[${i + 1}/${products.length}] ${p.catalogNumber} ... `)

      // Recycle context periodically to avoid memory/cookie drift
      if (i > 0 && i % CONTEXT_RECYCLE_INTERVAL === 0) {
        await context.close()
        context = await createContext(browser)
      }

      try {
        const result = await downloadPdf(context, url)

        if (!result) {
          console.log('no PDF — skipped')
          failed++
        } else {
          const specSheetPath = saveSpecSheet(p.catalogNumber, result.tmpPath)

          // Also sync specSheets[0].path if the JSON array exists
          type SpecSheetEntry = { label: string; url: string; path?: string }
          const existingSheets = Array.isArray(p.specSheets) ? (p.specSheets as SpecSheetEntry[]) : null
          const updatedSheets = existingSheets && existingSheets.length > 0
            ? existingSheets.map((s, i) => (i === 0 ? { ...s, path: specSheetPath } : s))
            : undefined

          await prisma.product.update({
            where: { id: p.id },
            data: { specSheetPath, ...(updatedSheets ? { specSheets: updatedSheets } : {}) },
          })
          console.log(`OK (${Math.round(result.size / 1024)} KB)`)
          downloaded++
        }
      } catch (err) {
        console.log(`error: ${err instanceof Error ? err.message : String(err)}`)
        failed++
      }

      // Brief pause between downloads
      await new Promise(r => setTimeout(r, 400))
    }
  } finally {
    await context.close()
    await browser.close()
  }

  console.log(`\nDone. Downloaded: ${downloaded} | Failed: ${failed}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
