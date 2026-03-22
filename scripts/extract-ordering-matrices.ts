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
import { Prisma } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'
import { validateMatrixFieldPresence } from '../lib/configurator'

const anthropic = new Anthropic()
const DELAY_MS = 500
const MAX_SPEC_TEXT_LENGTH = 80_000

// ─── Prompt ─────────────────────────────────────────────────────────────────

function buildExtractionPrompt(specText: string, familyName: string, catalogNumber: string): string {
  const truncated = specText.slice(0, MAX_SPEC_TEXT_LENGTH)
  return `You are extracting ordering/catalog information from a lighting spec sheet. Work in three phases.

Product family: ${familyName}
Representative catalog number: ${catalogNumber}

---
PHASE 1 — DETECTION: Classify this spec sheet into exactly one matrixType:

- "sku_table": The spec sheet has ONLY a table of pre-built stock part numbers. Each row IS a complete orderable part number — no separate columns of options to pick and combine to build a number. No ordering matrix section exists.

- "configurable": The spec sheet has an ordering matrix with distinct columns of options (one code to pick per column to build a complete catalog string). No pre-built stock part table.

- "hybrid": The spec sheet has BOTH a pre-built SKU table of orderable part numbers AND either (a) a separate ordering matrix section, OR (b) language suggesting more options exist — such as: "more configurations available", "additional configurations", "consult factory", "custom configurations", "additional options", "contact your rep", or any explicit reference to ordering information beyond the stock table.

---
PHASE 2 — EXTRACTION per matrixType:

For "sku_table":
  Extract skuEntries[] only. Each entry:
    - position: row number (1-based, preserves source order)
    - stockPartNumber: full complete part number string (REQUIRED)
    - isCommon: true for rows visually emphasized (bold, shaded, "Most popular", "Standard", etc.)
    - shortCode, lumens, watts, cct, voltage, housing, description: extract if present in table columns
  Also extract:
    - baseFamily: family code prefix or first word of first SKU
    - sampleNumber: first entry's stockPartNumber

For "configurable":
  Extract the full ordering matrix:
    - baseFamily: the first segment / family code
    - separator: character between segments (usually "-")
    - sampleNumber: example assembled catalog number from the sheet
    - columns[]: ordered segments where you MUST pick exactly one option
        Each column: { position (0-based), label, shortLabel, required, options[] }
        Each option: { code, description, notes?, constraints? }
        Position 0 IS the family code column. Joining all column selections should produce the sample number.
    - suffixOptions[]: OPTIONAL codes added at the end (accessories/features)
        Each suffix: { code, description, notes?, constraints? }
  CRITICAL: Extract ALL options for each column, not just a sample.
  Include footnote text in notes field. Include constraint text in constraints array.

For "hybrid":
  Extract BOTH:
    - columns[], suffixOptions[] (the full ordering matrix, same rules as "configurable")
    - skuEntries[] (the pre-built stock table, same rules as "sku_table")

---
PHASE 3 — RESPONSE FORMAT:

Return ONLY valid JSON — no preamble, no markdown backticks.

If no ordering matrix or SKU table is found at all, return: {"found": false}

If found, return:
{
  "found": true,
  "matrixType": "configurable|sku_table|hybrid",
  "baseFamily": "...",
  "separator": "-",
  "sampleNumber": "...",
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
    { "code": "DIM", "description": "External 0-10V Dimming Leads" }
  ],
  "skuEntries": [
    {
      "position": 1,
      "stockPartNumber": "BRT6-A3-740-U-T4-36-GM",
      "lumens": "3000",
      "watts": "24",
      "cct": "4000K",
      "voltage": "120-277V",
      "isCommon": true
    }
  ]
}

Only include fields relevant to the matrixType:
  - "configurable": include columns, suffixOptions, baseFamily, separator, sampleNumber (omit skuEntries)
  - "sku_table": include skuEntries, baseFamily, sampleNumber (omit columns, suffixOptions, separator)
  - "hybrid": include all fields

Spec sheet text:
---
${truncated}
---`
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtractedMatrix {
  found: boolean
  matrixType?: 'configurable' | 'sku_table' | 'hybrid'
  // Configurable/Hybrid fields:
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
  // SKU table field:
  skuEntries?: Array<{
    position: number
    stockPartNumber: string
    shortCode?: string
    lumens?: string
    watts?: string
    cct?: string
    voltage?: string
    housing?: string
    description?: string
    isCommon?: boolean
  }>
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateConfigurableColumns(parsed: ExtractedMatrix): string[] {
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

  return errors
}

function validateSkuEntries(parsed: ExtractedMatrix): string[] {
  const errors: string[] = []

  if (!Array.isArray(parsed.skuEntries) || parsed.skuEntries.length === 0) {
    errors.push('skuEntries is empty or missing')
    return errors
  }

  parsed.skuEntries.forEach((entry, i) => {
    if (!entry.stockPartNumber || entry.stockPartNumber.trim() === '') {
      errors.push(`skuEntry at position ${entry.position} has empty stockPartNumber`)
    }
    if (typeof entry.position !== 'number' || entry.position <= 0) {
      errors.push(`skuEntry at index ${i} has invalid position ${entry.position} (must be > 0)`)
    }
  })

  return errors
}

function validateMatrix(parsed: ExtractedMatrix): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const matrixType = parsed.matrixType ?? 'configurable'

  // Check field presence using shared lib validator
  const presenceError = validateMatrixFieldPresence(
    matrixType,
    Array.isArray(parsed.columns) && parsed.columns.length > 0,
    Array.isArray(parsed.skuEntries) && parsed.skuEntries.length > 0
  )
  if (presenceError) {
    errors.push(presenceError)
    return { valid: false, errors }
  }

  if (matrixType === 'sku_table') {
    errors.push(...validateSkuEntries(parsed))
  } else if (matrixType === 'configurable') {
    errors.push(...validateConfigurableColumns(parsed))
  } else if (matrixType === 'hybrid') {
    errors.push(...validateConfigurableColumns(parsed))
    errors.push(...validateSkuEntries(parsed))
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
        max_tokens: 8192,
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

      // Map TS matrixType to Prisma enum
      const matrixType = parsed.matrixType ?? 'configurable'
      const dbMatrixType =
        matrixType === 'sku_table' ? 'SKU_TABLE' as const :
        matrixType === 'hybrid'    ? 'HYBRID'    as const :
                                     'CONFIGURABLE' as const

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
          baseFamily: parsed.baseFamily ?? product.familyName!,
          separator: parsed.separator ?? '-',
          sampleNumber: parsed.sampleNumber ?? null,
          matrixType: dbMatrixType,
          columns: parsed.columns ? (parsed.columns as Prisma.InputJsonValue) : Prisma.JsonNull,
          suffixOptions: parsed.suffixOptions ? (parsed.suffixOptions as Prisma.InputJsonValue) : Prisma.JsonNull,
          skuTable: parsed.skuEntries ? (parsed.skuEntries as Prisma.InputJsonValue) : Prisma.JsonNull,
          confidence: 0.80,
          extractionSource: 'AI',
        },
        update: {
          baseFamily: parsed.baseFamily ?? product.familyName!,
          separator: parsed.separator ?? '-',
          sampleNumber: parsed.sampleNumber ?? null,
          matrixType: dbMatrixType,
          columns: parsed.columns ? (parsed.columns as Prisma.InputJsonValue) : Prisma.JsonNull,
          suffixOptions: parsed.suffixOptions ? (parsed.suffixOptions as Prisma.InputJsonValue) : Prisma.JsonNull,
          skuTable: parsed.skuEntries ? (parsed.skuEntries as Prisma.InputJsonValue) : Prisma.JsonNull,
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

      // Log line varies by matrixType
      if (matrixType === 'sku_table') {
        console.log(`  [${i + 1}/${uniqueFamilies.length}] OK ${product.manufacturer.name} | ${product.familyName} | SKU TABLE | ${(parsed.skuEntries ?? []).length} SKUs | ${familyCount} products linked | sample: ${parsed.sampleNumber}`)
      } else if (matrixType === 'hybrid') {
        console.log(`  [${i + 1}/${uniqueFamilies.length}] OK ${product.manufacturer.name} | ${product.familyName} | HYBRID | ${(parsed.columns ?? []).length} cols + ${(parsed.skuEntries ?? []).length} SKUs | ${familyCount} products linked | sample: ${parsed.sampleNumber}`)
      } else {
        console.log(`  [${i + 1}/${uniqueFamilies.length}] OK ${product.manufacturer.name} | ${product.familyName} | ${(parsed.columns ?? []).length} cols + ${(parsed.suffixOptions ?? []).length} suffixes | ${familyCount} products linked | sample: ${parsed.sampleNumber}`)
      }
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
