/**
 * Backfill configOptions for all products with spec sheet PDFs.
 * Uses extractConfigTable() to parse ordering tables via Claude AI.
 *
 * Usage:
 *   npx tsx scripts/extract-config-options.ts           # skip already-set
 *   npx tsx scripts/extract-config-options.ts --force   # re-extract all
 */
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: `${__dirname}/../.env`, override: true })
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse')
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '../node_modules/@prisma/client/index.js'
import { extractConfigTable } from '../lib/crawler/parser.js'

const prisma = new PrismaClient()
const force = process.argv.includes('--force')

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const products = await prisma.product.findMany({
    where: { specSheetPath: { not: null } },
    select: {
      id: true,
      catalogNumber: true,
      specSheetPath: true,
      configOptions: true,
      manufacturer: { select: { slug: true } },
    },
    orderBy: { catalogNumber: 'asc' },
  })

  console.log(`Found ${products.length} products with spec sheets`)
  if (force) console.log('  --force: re-extracting all\n')

  let updated = 0
  let skipped = 0
  let missing = 0
  let noTable = 0

  for (const product of products) {
    const { id, catalogNumber, specSheetPath, configOptions } = product

    // Skip if already set (unless --force)
    if (configOptions && !force) {
      process.stdout.write(`  skip  ${catalogNumber} (already set)\n`)
      skipped++
      continue
    }

    const relPath = specSheetPath!.replace(/^\//, '')
    const absPath = path.join(process.cwd(), 'public', relPath)

    if (!fs.existsSync(absPath)) {
      process.stdout.write(`  miss  ${catalogNumber} — PDF not found\n`)
      missing++
      continue
    }

    try {
      const buf = fs.readFileSync(absPath)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = new PDFParse({ data: new Uint8Array(buf), verbosity: 0 }) as any
      await p.load()
      const textResult = await p.getText() as { pages: Array<{ text: string }> }
      const rawText = textResult.pages.map((pg) => pg.text).join('\n')
      const result = await extractConfigTable(rawText)

      if (!result || Object.keys(result).length === 0) {
        process.stdout.write(`  none  ${catalogNumber} — no ordering table found\n`)
        noTable++
      } else {
        await prisma.product.update({
          where: { id },
          data: { configOptions: result },
        })
        const cols = Object.keys(result).join(', ')
        process.stdout.write(`  ✓     ${catalogNumber} → ${Object.keys(result).length} columns: ${cols}\n`)
        updated++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stdout.write(`  ✗     ${catalogNumber} — ${msg.slice(0, 100)}\n`)
      noTable++
    }

    // Rate limit: avoid hammering Claude API
    await sleep(500)
  }

  await prisma.$disconnect()

  console.log('\n── Summary ─────────────────────────────')
  console.log(`  Updated   : ${updated}`)
  console.log(`  Skipped   : ${skipped}`)
  console.log(`  Missing   : ${missing}`)
  console.log(`  No table  : ${noTable}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
