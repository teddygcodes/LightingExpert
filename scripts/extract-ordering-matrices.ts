// scripts/extract-ordering-matrices.ts
//
// Extracts ordering matrices from spec sheet text using Claude AI.
// Stores at family level (one matrix per manufacturer+familyName pair).
// Links all products in the family to the created matrix.
//
// Usage:
//   npm run extract-matrices                            # all families with rawSpecText
//   npm run extract-matrices -- --manufacturer=cooper  # one manufacturer
//   npm run extract-matrices -- --family=BRT6          # single family
//   npm run extract-matrices -- --limit=10             # test run
//   npm run extract-matrices -- --force                # re-extract even if matrix exists

import * as dotenv from 'dotenv'
dotenv.config({ override: true })

import { prisma } from '../lib/db'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()
const DELAY_MS = 500
const MAX_SPEC_TEXT_LENGTH = 80_000

// ─── Prompt ─────────────────────────────────────────────────────────────────

function buildExtractionPrompt(specText: string, familyName: string, catalogNumber: string): string {
  const truncated = specText.slice(0, MAX_SPEC_TEXT_LENGTH)
  return `Extract the ordering/catalog number matrix from this lighting spec sheet.

Product family: ${familyName}
Representative catalog number: ${catalogNumber}

The ordering matrix shows how to build a complete catalog/part number by selecting one option from each column. It typically appears under "Ordering Information" and includes:
- A base family code as the first segment
- Multiple required columns (Configuration, CCT, Voltage, Distribution, Height, Finish, etc.)
- Each column has coded options with descriptions
- Optional suffix codes added at the end for accessories/features
- A sample number showing the full assembled string

Return ONLY valid JSON — no preamble, no markdown backticks.

If no ordering matrix is found in the text, return: {"found": false}

If found, return:
{
  "found": true,
  "baseFamily": "BRT6",
  "separator": "-",
  "sampleNumber": "BRT6-A3-740-U-T4-36-GM",
  "columns": [
    {
      "position": 0,
      "label": "Product Family",
      "shortLabel": "Family",
      "required": true,
      "options": [
        { "code": "BRT6", "description": "Bollard, 6\\" Round Base" }
      ]
    },
    {
      "position": 1,
      "label": "Configuration",
      "shortLabel": "Config",
      "required": true,
      "options": [
        { "code": "A1", "description": "1000lm Nominal" },
        { "code": "A3", "description": "3000lm Nominal" }
      ]
    }
  ],
  "suffixOptions": [
    { "code": "DIM", "description": "External 0-10V Dimming Leads" },
    { "code": "DALI", "description": "DALI Driver" }
  ]
}

CRITICAL RULES:
- Position 0 IS the family code column. The builder joins all column selections — it does NOT separately prepend baseFamily.
- Verify: if you join one option from each column with the separator, it should roughly match the sample number.
- SEPARATE required pick-one columns from optional additive suffix codes.
  - Columns: ordered segments where you MUST pick exactly one option (Family, Config, CCT, Voltage, etc.)
  - Suffix options: OPTIONAL codes added at the end (DIM, DALI, F, CBP, CC, etc.) — usually listed under "Options (Add as Suffix)"
- Extract ALL options for each column, not just a sample.
- Include footnote text in the notes field if present.
- Include constraint text in the constraints array if mentioned (e.g., "Not available with 480V").

Spec sheet text:
---
${truncated}
---`
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtractedMatrix {
  found: boolean
  baseFamily?: string
  separator?: string
  sampleNumber?: string
  columns?: Array<{
    position: number
    label: string
    shortLabel: string
    required: boolean
    options: Array<{ code: string; description: string; notes?: string; constraints?: string[] }>
  }>
  suffixOptions?: Array<{ code: string; description: string; notes?: string; constraints?: string[] }>
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateMatrix(parsed: ExtractedMatrix): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!parsed.baseFamily || parsed.baseFamily.trim() === '') {
    errors.push('baseFamily is empty')
  }

  if (!Array.isArray(parsed.columns) || parsed.columns.length === 0) {
    errors.push('no columns found')
  } else {
    // Check positions are unique and sequential
    const positions = parsed.columns.map(c => c.position).sort((a, b) => a - b)
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i) {
        errors.push(`column positions not sequential: expected ${i}, got ${positions[i]}`)
        break
      }
    }

    // Check each required column has at least one option with non-empty codes
    for (const col of parsed.columns) {
      if (col.required && (!col.options || col.options.length === 0)) {
        errors.push(`required column "${col.label}" has no options`)
      }
      const codes = new Set<string>()
      for (const opt of (col.options ?? [])) {
        if (!opt.code || opt.code.trim() === '') {
          errors.push(`empty option code in column "${col.label}"`)
        }
        if (codes.has(opt.code)) {
          errors.push(`duplicate option code "${opt.code}" in column "${col.label}"`)
        }
        codes.add(opt.code)
      }
    }

    // Check sample number roughly matches column structure
    if (parsed.sampleNumber && parsed.separator) {
      const sampleSegments = parsed.sampleNumber.split(parsed.separator)
      const requiredColumns = parsed.columns.filter(c => c.required)
      if (Math.abs(sampleSegments.length - requiredColumns.length) > 2) {
        errors.push(`sample number has ${sampleSegments.length} segments but ${requiredColumns.length} required columns — possible mismatch`)
      }
      if (!parsed.sampleNumber.startsWith(parsed.baseFamily ?? '')) {
        errors.push(`sample number "${parsed.sampleNumber}" doesn't start with baseFamily "${parsed.baseFamily}"`)
      }
    }
  }

  // Validate suffix options
  if (parsed.suffixOptions) {
    const suffixCodes = new Set<string>()
    for (const suf of parsed.suffixOptions) {
      if (!suf.code || suf.code.trim() === '') {
        errors.push('empty suffix option code')
      }
      if (suffixCodes.has(suf.code)) {
        errors.push(`duplicate suffix code "${suf.code}"`)
      }
      suffixCodes.add(suf.code)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const manufacturerArg = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1]
  const familyArg = args.find(a => a.startsWith('--family='))?.split('=')[1]
  const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1]
  const force = args.includes('--force')

  // Fetch all candidate products (active, has rawSpecText, has familyName)
  const where: Record<string, unknown> = {
    isActive: true,
    rawSpecText: { not: null },
    familyName: { not: null },
  }
  if (manufacturerArg) where.manufacturer = { slug: manufacturerArg }
  if (familyArg) where.familyName = { contains: familyArg, mode: 'insensitive' }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      catalogNumber: true,
      familyName: true,
      rawSpecText: true,
      manufacturerId: true,
      specExtractionStatus: true,
      manufacturer: { select: { name: true, slug: true, id: true } },
    },
    orderBy: { catalogNumber: 'asc' },
  })

  // Deduplicate by manufacturer + familyName, picking the best representative:
  // 1. Longest rawSpecText (most content to extract from)
  // 2. Tie-break: specExtractionStatus === 'SUCCESS'
  const familyMap = new Map<string, typeof products[0]>()
  for (const p of products) {
    const key = `${p.manufacturerId}::${p.familyName}`
    const existing = familyMap.get(key)
    if (!existing) {
      familyMap.set(key, p)
      continue
    }
    const pLen = p.rawSpecText?.length ?? 0
    const eLen = existing.rawSpecText?.length ?? 0
    if (pLen > eLen || (pLen === eLen && p.specExtractionStatus === 'SUCCESS' && existing.specExtractionStatus !== 'SUCCESS')) {
      familyMap.set(key, p)
    }
  }
  let uniqueFamilies = Array.from(familyMap.values())

  // Skip families that already have a matrix (unless --force)
  if (!force) {
    const existingMatrices = await prisma.orderingMatrix.findMany({
      select: { manufacturerId: true, familyName: true },
    })
    const existingKeys = new Set(existingMatrices.map(m => `${m.manufacturerId}::${m.familyName}`))
    uniqueFamilies = uniqueFamilies.filter(p => !existingKeys.has(`${p.manufacturerId}::${p.familyName}`))
  }

  if (limitArg) uniqueFamilies = uniqueFamilies.slice(0, parseInt(limitArg, 10))

  console.log(`Found ${uniqueFamilies.length} unique families to extract matrices from`)

  let extracted = 0
  let noMatrix = 0
  let invalid = 0
  let failed = 0

  for (let i = 0; i < uniqueFamilies.length; i++) {
    const product = uniqueFamilies[i]

    if (!product.rawSpecText || product.rawSpecText.length < 100) {
      console.log(`  [${i + 1}/${uniqueFamilies.length}] SKIP ${product.manufacturer.name} | ${product.familyName} — spec text too short`)
      noMatrix++
      continue
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: buildExtractionPrompt(product.rawSpecText, product.familyName!, product.catalogNumber),
        }],
      })

      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
      const parsed = JSON.parse(cleaned) as ExtractedMatrix

      if (!parsed.found) {
        console.log(`  [${i + 1}/${uniqueFamilies.length}] NO MATRIX ${product.manufacturer.name} | ${product.familyName}`)
        noMatrix++
        continue
      }

      const { valid, errors } = validateMatrix(parsed)
      if (!valid) {
        console.log(`  [${i + 1}/${uniqueFamilies.length}] INVALID ${product.familyName}: ${errors.join('; ')}`)
        invalid++
        continue
      }

      // Upsert the matrix at family level
      const matrix = await prisma.orderingMatrix.upsert({
        where: {
          manufacturerId_familyName: {
            manufacturerId: product.manufacturerId,
            familyName: product.familyName!,
          },
        },
        create: {
          manufacturerId: product.manufacturerId,
          familyName: product.familyName!,
          baseFamily: parsed.baseFamily!,
          separator: parsed.separator ?? '-',
          sampleNumber: parsed.sampleNumber ?? null,
          columns: parsed.columns!,
          suffixOptions: parsed.suffixOptions ?? [],
          confidence: 0.80,
          extractionSource: 'AI',
        },
        update: {
          baseFamily: parsed.baseFamily!,
          separator: parsed.separator ?? '-',
          sampleNumber: parsed.sampleNumber ?? null,
          columns: parsed.columns!,
          suffixOptions: parsed.suffixOptions ?? [],
          confidence: 0.80,
          extractedAt: new Date(),
        },
      })

      // Link ALL products in this family to the matrix
      await prisma.product.updateMany({
        where: {
          manufacturerId: product.manufacturerId,
          familyName: product.familyName!,
          isActive: true,
        },
        data: { orderingMatrixId: matrix.id },
      })

      const familyCount = await prisma.product.count({
        where: { orderingMatrixId: matrix.id },
      })

      extracted++
      console.log(`  [${i + 1}/${uniqueFamilies.length}] OK ${product.manufacturer.name} | ${product.familyName} | ${parsed.columns!.length} cols + ${(parsed.suffixOptions ?? []).length} suffixes | ${familyCount} products linked | sample: ${parsed.sampleNumber}`)
    } catch (err) {
      console.error(`  [${i + 1}/${uniqueFamilies.length}] FAIL ${product.familyName}:`, err instanceof Error ? err.message : err)
      failed++
    }

    if (i < uniqueFamilies.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))

    if ((i + 1) % 50 === 0) {
      console.log(`\n  Progress: ${i + 1}/${uniqueFamilies.length} | extracted: ${extracted} | no matrix: ${noMatrix} | invalid: ${invalid} | failed: ${failed}\n`)
    }
  }

  console.log(`\nDone.`)
  console.log(`  Extracted:  ${extracted}`)
  console.log(`  No matrix:  ${noMatrix}`)
  console.log(`  Invalid:    ${invalid}`)
  console.log(`  Failed:     ${failed}`)
  console.log(`  Total:      ${uniqueFamilies.length}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
