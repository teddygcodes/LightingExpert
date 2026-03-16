/**
 * Backfill missing product thumbnails from iuseelite.com product pages.
 * Skips products that already have a thumbnail on disk.
 * Uses concurrency=10 for speed since this is image-only (no AI, no PDF).
 */
import 'dotenv/config'
import { chromium } from 'playwright'
import * as cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'
import pLimit from 'p-limit'
import { PrismaClient } from '@prisma/client'
import { getThumbnailPath } from '../lib/thumbnails'
import https from 'https'
import http from 'http'

const prisma = new PrismaClient()

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

async function main() {
  // Find Elite-only products missing thumbnails
  const eliteMfr = await prisma.manufacturer.findUnique({ where: { slug: 'elite' } })
  if (!eliteMfr) { console.error('Elite manufacturer not found'); process.exit(1) }

  const products = await prisma.product.findMany({
    where: { manufacturerId: eliteMfr.id, productPageUrl: { not: null } },
    select: { id: true, catalogNumber: true, productPageUrl: true },
    orderBy: { updatedAt: 'desc' },
  })

  const missing = products.filter((p) => {
    const thumbPath = getThumbnailPath('elite', p.catalogNumber)
    return !fs.existsSync(thumbPath)
  })

  console.log(`Elite products total: ${products.length}`)
  console.log(`Missing thumbnails: ${missing.length}`)
  if (missing.length === 0) { console.log('All thumbnails present!'); await prisma.$disconnect(); return }

  const browser = await chromium.launch({ headless: true })
  const limit = pLimit(10)
  let done = 0
  let saved = 0
  let failed = 0

  await Promise.all(
    missing.map((p) =>
      limit(async () => {
        const url = p.productPageUrl!
        try {
          const page = await browser.newPage()
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
          const html = await page.content()
          await page.close()
          const $ = cheerio.load(html)
          const imgEl = $('img.wp-post-image').first()
          const imgUrl =
            imgEl.attr('data-large_image') ||
            imgEl.attr('src') ||
            $('.woocommerce-product-gallery__image a').first().attr('href') ||
            $('.woocommerce-product-gallery img').first().attr('src') ||
            null

          if (imgUrl) {
            const buf = await downloadImageBuffer(imgUrl)
            if (buf) {
              const thumbPath = getThumbnailPath('elite', p.catalogNumber)
              fs.mkdirSync(path.dirname(thumbPath), { recursive: true })
              fs.writeFileSync(thumbPath, buf)
              saved++
            } else { failed++ }
          } else { failed++ }
        } catch { failed++ }

        done++
        if (done % 50 === 0 || done === missing.length) {
          console.log(`[${done}/${missing.length}] saved: ${saved}  failed: ${failed}`)
        }
      })
    )
  )

  await browser.close()
  await prisma.$disconnect()
  console.log(`\nDone. Saved: ${saved}  Failed: ${failed}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
