/**
 * scripts/extract-specs-from-pdfs.ts
 *
 * Reads cached spec sheet PDFs, extracts text with pdf-parse,
 * sends to Claude for structured extraction, validates the output,
 * and writes to specExtractionJson (staging field).
 *
 * Does NOT write to main Product fields — use scripts/promote-extractions.ts for that.
 *
 * Usage:
 *   npm run extract-specs                              # all products with a cached PDF
 *   npm run extract-specs -- --manufacturer=elite      # one manufacturer
 *   npm run extract-specs -- --limit=10                # test run
 *   npm run extract-specs -- --force                   # re-extract even if already done
 *   npm run extract-specs -- --dry-run                 # resolve file, print JSON, no writes
 *   npm run extract-specs -- --catalog=CB2-LED         # surgical: one product by catalog number
 *   npm run extract-specs -- --id=PRODUCT_ID           # surgical: one product by DB id
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ override: true })

import { prisma } from '../lib/db'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { ExtractionStatus } from '@prisma/client'
import { Prisma } from '@prisma/client'

const anthropic = new Anthropic()

const DELAY_MS = 500
const MAX_PDF_TEXT = 20000 // 20K chars — enough for most spec sheets

// ─── Suspicious PDF detection ────────────────────────────────────────────────

const LIGHTING_HEADERS = ['watt', 'lumen', 'cri', 'volt', 'cct', 'color', 'mount']

function isSuspiciousPdf(text: string): { suspicious: boolean; reason?: string } {
  if (text.length < 200) {
    return { suspicious: true, reason: `text too short (${text.length} chars)` }
  }

  // Non-ASCII ratio > 30%
  const nonAscii = text.split('').filter(c => c.charCodeAt(0) > 127).length
  if (nonAscii / text.length > 0.30) {
    return { suspicious: true, reason: `high non-ASCII ratio (${Math.round((nonAscii / text.length) * 100)}%)` }
  }

  // No digit sequences
  if (!/\d{2,}/.test(text)) {
    return { suspicious: true, reason: 'no numeric data found' }
  }

  // No key lighting headers
  const lower = text.toLowerCase()
  const hasHeader = LIGHTING_HEADERS.some(h => lower.includes(h))
  if (!hasHeader) {
    return { suspicious: true, reason: 'no lighting-related headers found' }
  }

  return { suspicious: false }
}

// ─── Normalization ────────────────────────────────────────────────────────────
// Runs BEFORE validation, so thresholds check clean values

function normalizeExtracted(raw: Record<string, unknown>): Record<string, unknown> {
  const n = { ...raw }

  // CCT: "4000 K", "4000k", "4000K" → "4000K"
  if (Array.isArray(n.cctOptions)) {
    n.cctOptions = (n.cctOptions as unknown[])
      .map(c => String(c).replace(/\s+/g, '').replace(/k$/i, 'K'))
      .filter(c => /^\d{4}K$/.test(c)) // only valid ####K format
  }

  // CRI: "80+", "80 CRI", "CRI 80+", "≥80" → extract numeric (leading digits)
  if (n.cri != null) {
    const criNum = parseFloat(String(n.cri).replace(/[^0-9.]/g, ''))
    n.cri = isNaN(criNum) ? null : criNum
  }

  // Efficacy: strip "LPW", "lm/W" suffix
  if (n.efficacy != null) {
    const effNum = parseFloat(String(n.efficacy).replace(/[^0-9.]/g, ''))
    n.efficacy = isNaN(effNum) ? null : effNum
  }

  // Dimming protocol synonyms → consistent strings (promotion will map to enum)
  if (n.dimmingType != null) {
    const d = String(n.dimmingType).toLowerCase().replace('–', '-').trim()
    if (d.startsWith('0-10') || d === '0-10v') n.dimmingType = '0-10V'
    else if (d === 'dali') n.dimmingType = 'DALI'
    else if (d.startsWith('triac') || d.startsWith('phase')) n.dimmingType = 'TRIAC'
    else if (d.startsWith('lutron')) n.dimmingType = 'LUTRON'
    else if (d === 'elv') n.dimmingType = 'ELV'
    else if (d === 'nlight') n.dimmingType = 'NLIGHT'
  }

  // Booleans: "yes", "listed", "available", "true" → true; "no", "false" → false
  const BOOLEAN_FIELDS = ['dimmable', 'wetLocation', 'dampLocation', 'ulListed', 'dlcListed', 'dlcPremium', 'energyStar']
  for (const field of BOOLEAN_FIELDS) {
    if (typeof n[field] === 'string') {
      const v = (n[field] as string).toLowerCase().trim()
      if (['yes', 'true', 'listed', 'available', '1'].includes(v)) n[field] = true
      else if (['no', 'false', 'not listed', '0', 'n/a'].includes(v)) n[field] = false
      else n[field] = null // unknown
    }
  }

  // Lowercase string arrays: applications, opticalDistribution, mountingTypes
  for (const field of ['applications', 'opticalDistribution', 'mountingTypes']) {
    if (Array.isArray(n[field])) {
      n[field] = (n[field] as unknown[]).map(v => String(v).toLowerCase().trim()).filter(Boolean)
    }
  }

  return n
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationResult {
  cleanedData: Record<string, unknown>
  errors: string[]
  fieldConfidence: Record<string, number>
  overallConfidence: number
}

function validateExtraction(raw: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  const cleaned: Record<string, unknown> = { ...raw }
  const fieldConfidence: Record<string, number> = {}

  // ── Wattage ──
  if (cleaned.wattageMin != null && cleaned.wattageMax != null) {
    const min = Number(cleaned.wattageMin)
    const max = Number(cleaned.wattageMax)
    if (isNaN(min) || isNaN(max)) {
      errors.push('wattage: min/max not numeric')
      cleaned.wattageMin = cleaned.wattageMax = null
    } else if (min > max) {
      errors.push(`wattage: min (${min}) > max (${max})`)
      cleaned.wattageMin = cleaned.wattageMax = null
    } else if (max > 2000) {
      errors.push(`wattage: max (${max}) exceeds 2000W — likely OCR error`)
      cleaned.wattageMin = cleaned.wattageMax = null
    } else {
      fieldConfidence.wattageMin = 0.90
      fieldConfidence.wattageMax = 0.90
    }
  }
  if (cleaned.wattage != null) {
    const w = Number(cleaned.wattage)
    if (isNaN(w) || w <= 0 || w > 2000) {
      errors.push(`wattage: invalid value ${cleaned.wattage}`)
      cleaned.wattage = null
    } else {
      fieldConfidence.wattage = 0.90
    }
  }

  // ── Lumens ──
  if (cleaned.lumensMin != null && cleaned.lumensMax != null) {
    const min = Number(cleaned.lumensMin)
    const max = Number(cleaned.lumensMax)
    if (isNaN(min) || isNaN(max)) {
      errors.push('lumens: min/max not numeric')
      cleaned.lumensMin = cleaned.lumensMax = null
    } else if (min > max) {
      errors.push(`lumens: min (${min}) > max (${max})`)
      cleaned.lumensMin = cleaned.lumensMax = null
    } else if (max > 500000) {
      errors.push(`lumens: max (${max}) exceeds 500,000 — likely OCR error`)
      cleaned.lumensMin = cleaned.lumensMax = null
    } else {
      fieldConfidence.lumensMin = 0.90
      fieldConfidence.lumensMax = 0.90
    }
  }
  if (cleaned.lumens != null) {
    const l = Number(cleaned.lumens)
    if (isNaN(l) || l <= 0 || l > 500000) {
      errors.push(`lumens: invalid value ${cleaned.lumens}`)
      cleaned.lumens = null
    } else {
      fieldConfidence.lumens = 0.90
    }
  }

  // ── CRI ──
  if (cleaned.cri != null) {
    const c = Number(cleaned.cri)
    if (isNaN(c) || c < 50 || c > 100) {
      errors.push(`CRI: invalid value ${cleaned.cri} (must be 50–100)`)
      cleaned.cri = null
    } else {
      fieldConfidence.cri = 0.95
    }
  }

  // ── Efficacy ──
  if (cleaned.efficacy != null) {
    const e = Number(cleaned.efficacy)
    if (isNaN(e) || e <= 0 || e > 300) {
      errors.push(`efficacy: invalid value ${cleaned.efficacy} (must be 0–300 LPW)`)
      cleaned.efficacy = null
    } else {
      fieldConfidence.efficacy = 0.85
    }
  }

  // ── CCT options ──
  if (Array.isArray(cleaned.cctOptions)) {
    const cctPattern = /^\d{4}K$/
    const valid = (cleaned.cctOptions as string[]).filter(c => {
      if (!cctPattern.test(c)) {
        errors.push(`CCT: invalid format "${c}" — expected ####K`)
        return false
      }
      const temp = parseInt(c)
      if (temp < 1800 || temp > 7000) {
        errors.push(`CCT: out of range "${c}"`)
        return false
      }
      return true
    })
    cleaned.cctOptions = valid.length > 0 ? valid : null
    if (valid.length > 0) fieldConfidence.cctOptions = 0.90
  }

  // ── Voltage ──
  if (cleaned.voltage != null) {
    const v = String(cleaned.voltage)
    if (v.length > 50) {
      errors.push('voltage: suspiciously long value — likely parse error')
      cleaned.voltage = null
    } else {
      fieldConfidence.voltage = 0.85
    }
  }

  // ── Weight ──
  if (cleaned.weight != null) {
    const w = Number(cleaned.weight)
    if (isNaN(w) || w <= 0 || w > 500) {
      errors.push(`weight: invalid value ${cleaned.weight}`)
      cleaned.weight = null
    } else {
      fieldConfidence.weight = 0.85
    }
  }

  // ── Booleans — high confidence when present ──
  for (const field of ['dimmable', 'wetLocation', 'dampLocation', 'ulListed', 'dlcListed', 'dlcPremium', 'energyStar']) {
    if (typeof cleaned[field] === 'boolean') {
      fieldConfidence[field] = 0.90
    }
  }

  // ── Soft/inferred fields — lower confidence ──
  if (Array.isArray(cleaned.applications) && (cleaned.applications as string[]).length > 0) {
    fieldConfidence.applications = 0.70
  }
  if (Array.isArray(cleaned.opticalDistribution) && (cleaned.opticalDistribution as string[]).length > 0) {
    fieldConfidence.opticalDistribution = 0.75
  }
  if (cleaned.dimmingType != null) {
    fieldConfidence.dimmingType = 0.85
  }
  if (Array.isArray(cleaned.mountingTypes) && (cleaned.mountingTypes as string[]).length > 0) {
    fieldConfidence.mountingTypes = 0.85
  }
  if (cleaned.dimensions != null) {
    fieldConfidence.dimensions = 0.80
  }
  if (cleaned.ipRating != null) {
    fieldConfidence.ipRating = 0.85
  }
  if (cleaned.nemaRating != null) {
    fieldConfidence.nemaRating = 0.85
  }
  if (cleaned.description != null && String(cleaned.description).length > 10) {
    fieldConfidence.description = 0.75
  }

  // Overall confidence = mean of non-null field confidences (display only — not used for promotion gating)
  const vals = Object.values(fieldConfidence)
  const overallConfidence = vals.length > 0
    ? vals.reduce((a, b) => a + b, 0) / vals.length
    : 0

  cleaned._fieldConfidence = fieldConfidence
  cleaned._overallConfidence = overallConfidence

  return { cleanedData: cleaned, errors, fieldConfidence, overallConfidence }
}

// ─── Extraction prompt ────────────────────────────────────────────────────────

function buildExtractionPrompt(pdfText: string, catalogNumber: string): string {
  return `Extract structured specifications from this lighting fixture spec sheet.
Return ONLY valid JSON — no preamble, no markdown backticks, no explanation.

Product: ${catalogNumber}

IMPORTANT:
- For fields with selectable ranges (wattage, lumens), ALWAYS populate the min/max fields. Only use the single nominal field if there is truly one fixed value.
- If a field is not found in the text, use null. Do NOT guess or infer values not stated in the document.
- For CCT options, use the exact format "3000K", "3500K", "4000K", etc.
- For mounting types, use lowercase: "pendant", "hook", "surface", "chain", "wall", "recessed", "pole", "stem"
- For optical distributions, use lowercase: "wide", "medium", "narrow", "very wide", "asymmetric"
- Include an "_evidence" key mapping each extracted field name to a brief quote/location from the text.

Return this exact JSON shape (use null for missing values):
{
  "wattage": number or null,
  "wattageMin": number or null,
  "wattageMax": number or null,
  "lumens": number or null,
  "lumensMin": number or null,
  "lumensMax": number or null,
  "efficacy": number or null,
  "cri": number or null,
  "cctOptions": string[] or null,
  "voltage": string or null,
  "dimmable": boolean or null,
  "dimmingType": string or null,
  "mountingTypes": string[] or null,
  "dimensions": string or null,
  "weight": number or null,
  "ipRating": string or null,
  "nemaRating": string or null,
  "wetLocation": boolean or null,
  "dampLocation": boolean or null,
  "ulListed": boolean or null,
  "dlcListed": boolean or null,
  "dlcPremium": boolean or null,
  "energyStar": boolean or null,
  "opticalDistribution": string[] or null,
  "applications": string[] or null,
  "description": string or null,
  "_evidence": {
    "fieldName": "brief quote or section reference from document"
  }
}

Spec sheet text:
---
${pdfText}
---`
}

// ─── Claude extraction ────────────────────────────────────────────────────────

async function extractWithClaude(pdfText: string, catalogNumber: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: buildExtractionPrompt(pdfText, catalogNumber),
      }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    console.error(`  Claude extraction failed for ${catalogNumber}:`, err instanceof Error ? err.message : err)
    return null
  }
}

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractPdfText(filePath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(filePath)) return null
    const buffer = fs.readFileSync(filePath)
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { PDFParse } = require('pdf-parse') as any
    const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 })
    await parser.load()
    const result = await parser.getText() as { pages: Array<{ text: string }> }
    const text = result.pages.map((p: { text: string }) => p.text).join('\n')
    return text.substring(0, MAX_PDF_TEXT) || null
  } catch (err) {
    console.error(`  PDF parse failed for ${filePath}:`, err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Resolve PDF path ─────────────────────────────────────────────────────────

function resolvePdfPath(specSheetPath: string): string | null {
  // specSheetPath may be: "/spec-sheets/elite/CB2-LED.pdf" (absolute public path)
  const candidates = [
    path.join('public', specSheetPath),                   // /public/spec-sheets/elite/CB2-LED.pdf
    specSheetPath,                                         // as-is (maybe already absolute)
    path.join('public', 'spec-sheets', specSheetPath),    // fallback
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const manufacturerArg = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1]
  const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1]
  const catalogArg = args.find(a => a.startsWith('--catalog='))?.split('=')[1]
  const idArg = args.find(a => a.startsWith('--id='))?.split('=')[1]
  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')

  if (dryRun) console.log('DRY RUN — no writes will be made\n')

  const where: Record<string, unknown> = {
    isActive: true,
    specSheetPath: { not: null },
  }

  if (!force) {
    where.specExtractedAt = null
  }
  if (manufacturerArg) {
    where.manufacturer = { slug: manufacturerArg }
  }
  if (catalogArg) {
    where.catalogNumber = catalogArg
  }
  if (idArg) {
    where.id = idArg
  }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      catalogNumber: true,
      specSheetPath: true,
      manufacturer: { select: { name: true, slug: true } },
    },
    take: limitArg ? parseInt(limitArg) : undefined,
    orderBy: { catalogNumber: 'asc' },
  })

  console.log(`Found ${products.length} products to extract specs from`)
  if (products.length === 0) return

  let extracted = 0
  let withErrors = 0
  let failed = 0
  let suspicious = 0
  let noPdf = 0

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const specPath = product.specSheetPath
    if (!specPath) { noPdf++; continue }

    const pdfPath = resolvePdfPath(specPath)
    if (!pdfPath) {
      if (!dryRun) console.log(`  [${i + 1}/${products.length}] SKIP ${product.catalogNumber} — PDF not found at ${specPath}`)
      noPdf++
      continue
    }

    // Extract text
    const pdfText = await extractPdfText(pdfPath)
    if (!pdfText || pdfText.trim().length < 50) {
      console.log(`  [${i + 1}/${products.length}] SKIP ${product.catalogNumber} — PDF text too short`)
      if (!dryRun) {
        await prisma.product.update({
          where: { id: product.id },
          data: { specExtractionStatus: ExtractionStatus.FAILED, specExtractedAt: new Date() },
        })
      }
      failed++
      continue
    }

    // Suspicious PDF check
    const suspiciousCheck = isSuspiciousPdf(pdfText)
    if (suspiciousCheck.suspicious) {
      console.log(`  [${i + 1}/${products.length}] SUSPICIOUS ${product.catalogNumber} — ${suspiciousCheck.reason}`)
      if (!dryRun) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            specExtractionStatus: ExtractionStatus.SUSPICIOUS,
            specExtractedAt: new Date(),
            rawSpecText: pdfText,
          },
        })
      }
      suspicious++
      continue
    }

    // DRY RUN: show text snippet + stop before Claude
    if (dryRun) {
      console.log(`\n  [${i + 1}/${products.length}] ${product.manufacturer.name} | ${product.catalogNumber}`)
      console.log(`  PDF: ${pdfPath} (${pdfText.length} chars)`)
      console.log(`  Text preview: ${pdfText.substring(0, 300).replace(/\n/g, ' ')}...`)
    }

    // Claude extraction
    const rawResult = await extractWithClaude(pdfText, product.catalogNumber)
    if (!rawResult) {
      console.error(`  [${i + 1}/${products.length}] FAILED ${product.catalogNumber} — Claude returned null`)
      if (!dryRun) {
        await prisma.product.update({
          where: { id: product.id },
          data: { specExtractionStatus: ExtractionStatus.FAILED, specExtractedAt: new Date() },
        })
      }
      failed++
      continue
    }

    // Separate _evidence from the main extraction payload
    const evidenceMap = (rawResult._evidence as Record<string, string> | null) ?? {}
    const rawWithoutEvidence = { ...rawResult }
    delete rawWithoutEvidence._evidence

    // Normalize
    const normalized = normalizeExtracted(rawWithoutEvidence)

    // Validate
    const { cleanedData, errors, overallConfidence } = validateExtraction(normalized)

    // Determine status
    let status: ExtractionStatus
    if (errors.length > 0 || overallConfidence < 0.40) {
      status = ExtractionStatus.PARTIAL
    } else {
      status = ExtractionStatus.SUCCESS
    }

    if (dryRun) {
      console.log(`  Status: ${status} | Confidence: ${(overallConfidence * 100).toFixed(0)}%`)
      if (errors.length > 0) console.log(`  Errors: ${errors.join('; ')}`)
      console.log(`  Extracted:`, JSON.stringify(cleanedData, null, 2).substring(0, 800))
      console.log(`  Evidence:`, JSON.stringify(evidenceMap, null, 2))
    } else {
      // Write to staging fields only — NOT to main Product fields
      await prisma.product.update({
        where: { id: product.id },
        data: {
          specExtractionJson: cleanedData as Prisma.InputJsonValue,
          specEvidenceJson: evidenceMap as Prisma.InputJsonValue,
          specExtractionErrors: errors,
          specExtractionStatus: status,
          specExtractedAt: new Date(),
          rawSpecText: pdfText,
        },
      })

      extracted++
      if (errors.length > 0) {
        withErrors++
        if (errors.length <= 3) {
          console.log(`  [${i + 1}/${products.length}] WARN ${product.manufacturer.name} | ${product.catalogNumber} — ${errors.join('; ')}`)
        } else {
          console.log(`  [${i + 1}/${products.length}] WARN ${product.manufacturer.name} | ${product.catalogNumber} — ${errors.length} validation errors`)
        }
      } else {
        console.log(`  [${i + 1}/${products.length}] OK ${product.manufacturer.name} | ${product.catalogNumber} (${(overallConfidence * 100).toFixed(0)}% confidence)`)
      }
    }

    // Rate limit between API calls
    if (i < products.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))

    // Progress every 100
    if ((i + 1) % 100 === 0) {
      console.log(`\n  Progress: ${i + 1}/${products.length} | extracted: ${extracted} | warnings: ${withErrors} | failed: ${failed} | suspicious: ${suspicious} | no PDF: ${noPdf}\n`)
    }
  }

  console.log('\nDone.')
  if (dryRun) {
    console.log('  (DRY RUN — no changes written)')
  } else {
    console.log(`  Extracted:   ${extracted}`)
    console.log(`  Warnings:    ${withErrors}`)
    console.log(`  Failed:      ${failed}`)
    console.log(`  Suspicious:  ${suspicious}`)
    console.log(`  No PDF:      ${noPdf}`)
    console.log(`  Total:       ${products.length}`)
    console.log(`  Est. cost:   ~$${(extracted * 0.004).toFixed(2)}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
