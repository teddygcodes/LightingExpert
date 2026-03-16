/**
 * Pre-generates PNG thumbnails from spec sheet PDFs using macOS Quick Look (qlmanage).
 * No external dependencies required — works natively on macOS.
 *
 * Usage: npx tsx scripts/generate-thumbnails.ts
 *
 * Re-running is safe: already-generated thumbnails are skipped.
 * Results are written to thumbnails-log.json.
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '../node_modules/@prisma/client/index.js'
import { getThumbnailPath } from '../lib/thumbnails.js'

const prisma = new PrismaClient()

interface LogEntry { catalog: string; slug: string; path: string }
interface FailEntry { catalog: string; slug: string; reason: string }

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true, specSheetPath: { not: null } },
    select: {
      catalogNumber: true,
      specSheetPath: true,
      manufacturer: { select: { slug: true } },
    },
  })

  console.log(`Found ${products.length} products with spec sheets`)

  const generated: LogEntry[] = []
  const skipped: LogEntry[] = []
  const failed: FailEntry[] = []

  // Temp dir for qlmanage output
  const tmpDir = fs.mkdtempSync(path.join('/tmp', 'thumbnails-'))

  for (const product of products) {
    const slug = product.manufacturer.slug
    const catalog = product.catalogNumber
    const outPath = getThumbnailPath(slug, catalog)

    if (fs.existsSync(outPath)) {
      skipped.push({ catalog, slug, path: outPath })
      process.stdout.write(`  skip  ${slug}/${catalog}\n`)
      continue
    }

    const relativePath = product.specSheetPath!.replace(/^\//, '')
    const absPath = path.join(process.cwd(), 'public', relativePath)

    if (!fs.existsSync(absPath)) {
      failed.push({ catalog, slug, reason: `PDF not found: ${absPath}` })
      process.stdout.write(`  ✗ ${slug}/${catalog} — PDF file missing\n`)
      continue
    }

    let success = false
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        // qlmanage renders the PDF first page to a PNG
        // Output filename: {tmpDir}/{pdfFilename}.png
        execFileSync('qlmanage', ['-t', '-s', '900', '-o', tmpDir, absPath], { stdio: 'pipe' })

        const pdfFilename = path.basename(absPath) // e.g. hh6-led-ml-cct.pdf
        const qlOut = path.join(tmpDir, `${pdfFilename}.png`)

        if (!fs.existsSync(qlOut)) {
          throw new Error('qlmanage produced no output file')
        }

        // Move to final destination
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.copyFileSync(qlOut, outPath)
        fs.unlinkSync(qlOut)

        process.stdout.write(`  ✓ ${slug}/${catalog}\n`)
        generated.push({ catalog, slug, path: outPath })
        success = true
        break
      } catch (err) {
        if (attempt === 2) {
          const reason = err instanceof Error ? err.message : String(err)
          process.stdout.write(`  ✗ ${slug}/${catalog} — ${reason.slice(0, 120)}\n`)
          failed.push({ catalog, slug, reason })
        }
      }
    }

    if (!success && !failed.find((f) => f.catalog === catalog)) {
      failed.push({ catalog, slug, reason: 'Unknown error after retry' })
    }
  }

  // Cleanup temp dir
  fs.rmSync(tmpDir, { recursive: true, force: true })
  await prisma.$disconnect()

  const log = { generated, skipped, failed }
  fs.writeFileSync(path.join(process.cwd(), 'thumbnails-log.json'), JSON.stringify(log, null, 2))

  console.log('\n── Summary ──────────────────────────────')
  console.log(`  Generated : ${generated.length}`)
  console.log(`  Skipped   : ${skipped.length}`)
  console.log(`  Failed    : ${failed.length}`)
  console.log(`  Log       : thumbnails-log.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
