/**
 * Backfill product thumbnails for Current Lighting products by navigating to each product page
 * and screenshotting the hero image element.
 * Run with: npm run backfill:current-thumbs
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ override: true })

import { chromium, Browser, BrowserContext } from 'playwright'
import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const prisma = new PrismaClient()

const STEALTH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const THUMB_DIR = path.join(process.cwd(), 'public', 'thumbnails', 'current')
const CONTEXT_RECYCLE_INTERVAL = 30

function getThumbPath(catalogNumber: string): string {
  const safe = catalogNumber.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
  return path.join(THUMB_DIR, `${safe}.png`)
}

async function createContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent: STEALTH_UA,
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  return context
}

async function captureThumbnail(
  context: BrowserContext,
  productUrl: string,
  catalogNumber: string,
): Promise<boolean> {
  const destPath = getThumbPath(catalogNumber)
  if (fs.existsSync(destPath)) return true  // already cached

  const page = await context.newPage()
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const imgEl = page.locator('img[src*="cdn.currentlighting.com/site/prodimage1200/"]').first()
    const count = await imgEl.count()
    if (count === 0) return false

    await imgEl.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})

    const buf = await imgEl.screenshot({ type: 'png' })
    if (!buf || buf.length < 500) return false

    if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true })
    fs.writeFileSync(destPath, buf)
    return true
  } catch {
    return false
  } finally {
    await page.close()
  }
}

async function main() {
  const current = await prisma.manufacturer.findUnique({ where: { slug: 'current' } })
  if (!current) { console.error('Current Lighting manufacturer not found'); process.exit(1) }

  const all = await prisma.product.findMany({
    where: { manufacturerId: current.id, productPageUrl: { not: null } },
    select: { catalogNumber: true, productPageUrl: true },
  })

  const products = all.filter(p => !fs.existsSync(getThumbPath(p.catalogNumber)))
  console.log(`Found ${products.length} Current products needing thumbnails (${all.length - products.length} already cached)`)
  if (products.length === 0) { console.log('Nothing to do.'); return }

  if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  })

  let context = await createContext(browser)
  let saved = 0
  let failed = 0

  try {
    for (let i = 0; i < products.length; i++) {
      const p = products[i]
      process.stdout.write(`[${i + 1}/${products.length}] ${p.catalogNumber} ... `)

      if (i > 0 && i % CONTEXT_RECYCLE_INTERVAL === 0) {
        await context.close()
        context = await createContext(browser)
      }

      const ok = await captureThumbnail(context, p.productPageUrl!, p.catalogNumber)
      if (ok) {
        console.log(`OK (${Math.round(fs.statSync(getThumbPath(p.catalogNumber)).size / 1024)} KB)`)
        saved++
      } else {
        console.log('no image — skipped')
        failed++
      }

      await new Promise(r => setTimeout(r, 300))
    }
  } finally {
    await context.close()
    await browser.close()
  }

  console.log(`\nDone. Saved: ${saved} | Failed: ${failed}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
