/**
 * scripts/promote-extractions.ts
 *
 * Reads specExtractionJson from products that have been extracted but not promoted.
 * Applies per-field confidence thresholds, then writes only trusted fields to main
 * Product columns using a merge-only strategy (never blindly overwrites).
 *
 * Merge rules:
 *   - If main field is null → write (fill empty)
 *   - If main field is non-null → only write if new confidence > existing confidence + 0.05
 *   - MANUAL provenance fields (confidence 1.0) are never overwritten
 *
 * Updates fieldProvenance per-field (NOT a summary replacement).
 *
 * Usage:
 *   npm run promote-specs                           # all extracted products
 *   npm run promote-specs -- --manufacturer=elite   # one manufacturer
 *   npm run promote-specs -- --dry-run              # show decisions without writing
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ override: true })

import { prisma } from '../lib/db'
import { PromotionStatus } from '@prisma/client'
import { normalizeVoltage, normalizeDimmingTypes, normalizeMountingTypes } from '../lib/crawler/normalize'

// ─── Core fields — drive promotion status ────────────────────────────────────

const CORE_FIELDS = new Set(['wattage', 'lumens', 'cri', 'voltage', 'cctOptions', 'dimmable'])

// ─── Minimum confidence thresholds per field ─────────────────────────────────

const MIN_CONFIDENCE: Record<string, number> = {
  // Hard/numeric
  wattage: 0.80,
  wattageMin: 0.80,
  wattageMax: 0.80,
  lumens: 0.80,
  lumensMin: 0.80,
  lumensMax: 0.80,
  efficacy: 0.80,
  cri: 0.85,
  // Standard
  cctOptions: 0.85,
  voltage: 0.80,
  dimmable: 0.80,
  dimmingType: 0.75,
  dimensions: 0.75,
  weight: 0.75,
  ipRating: 0.80,
  nemaRating: 0.80,
  // Boolean certifications
  wetLocation: 0.85,
  dampLocation: 0.85,
  ulListed: 0.85,
  dlcListed: 0.85,
  dlcPremium: 0.85,
  energyStar: 0.85,
  // Soft/inferred
  opticalDistribution: 0.65,
  applications: 0.65,
  description: 0.70,
  mountingTypes: 0.75,
  formFactor: 0.75,
}

// ─── Field mapping: extraction JSON key → Product DB field ───────────────────

const FIELD_MAP: Record<string, string> = {
  wattage: 'wattage',
  wattageMin: 'wattageMin',
  wattageMax: 'wattageMax',
  lumens: 'lumens',
  lumensMin: 'lumensMin',
  lumensMax: 'lumensMax',
  efficacy: 'efficacy',
  cri: 'cri',
  cctOptions: 'cctOptions',     // string[] → Int[] conversion handled below
  voltage: 'voltage',            // string → Voltage enum handled below
  dimmable: 'dimmable',
  dimmingType: 'dimmingType',   // string → DimmingType[] handled below
  mountingTypes: 'mountingType', // string[] → MountingType[] handled below
  dimensions: 'dimensions',
  weight: 'weight',
  ipRating: 'ipRating',
  nemaRating: 'nemaRating',
  wetLocation: 'wetLocation',
  dampLocation: 'dampLocation',
  ulListed: 'ulListed',
  dlcListed: 'dlcListed',
  dlcPremium: 'dlcPremium',
  energyStar: 'energyStar',
  opticalDistribution: 'opticalDistribution',
  applications: 'applications',
  description: 'description',
  formFactor: 'formFactor',
}

// ─── Type conversion helpers ──────────────────────────────────────────────────

// "4000K" → 4000 (for cctOptions Int[] field)
function parseCctToInt(cctStr: string): number | null {
  const n = parseInt(String(cctStr).replace(/[^0-9]/g, ''))
  return isNaN(n) ? null : n
}

// Convert extracted value to the correct DB type for enum/array fields
function convertForDb(jsonKey: string, value: unknown): unknown {
  if (value == null) return null

  // cctOptions: string[] → Int[]
  if (jsonKey === 'cctOptions' && Array.isArray(value)) {
    const ints = (value as string[]).map(parseCctToInt).filter((n): n is number => n !== null)
    return ints.length > 0 ? ints : null
  }

  // voltage: string → Voltage enum
  if (jsonKey === 'voltage') {
    const mapped = normalizeVoltage(String(value))
    if (!mapped) return null // unmappable voltage — skip
    return mapped
  }

  // dimmingType: string → DimmingType[] (DB field is an array)
  if (jsonKey === 'dimmingType') {
    const types = normalizeDimmingTypes(String(value))
    return types.length > 0 ? types : null
  }

  // mountingTypes: string[] → MountingType[]
  if (jsonKey === 'mountingTypes' && Array.isArray(value)) {
    const combined = (value as string[]).join(',')
    const types = normalizeMountingTypes(combined)
    return types.length > 0 ? types : null
  }

  // nemaRating, ipRating: DB is String? — join arrays to comma-separated string
  const SCALAR_STRING_FIELDS = ['nemaRating', 'ipRating']
  if (SCALAR_STRING_FIELDS.includes(jsonKey) && Array.isArray(value)) {
    const joined = (value as unknown[]).join(', ')
    return joined.length > 0 ? joined : null
  }

  // opticalDistribution, applications: DB is String[] — keep as array
  const STRING_ARRAY_FIELDS = ['opticalDistribution', 'applications']
  if (STRING_ARRAY_FIELDS.includes(jsonKey) && !Array.isArray(value)) {
    return [String(value)]
  }

  return value
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const manufacturerArg = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1]
  const dryRun = args.includes('--dry-run')

  if (dryRun) console.log('DRY RUN — no writes will be made\n')

  const where: Record<string, unknown> = {
    isActive: true,
    specExtractedAt: { not: null },
    specExtractionJson: { not: null },
    specPromotedAt: null, // not yet promoted
  }

  if (manufacturerArg) {
    where.manufacturer = { slug: manufacturerArg }
  }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      catalogNumber: true,
      specExtractionJson: true,
      specEvidenceJson: true,
      fieldProvenance: true,
      // Existing main field values (to implement merge-only logic)
      wattage: true, wattageMin: true, wattageMax: true,
      lumens: true, lumensMin: true, lumensMax: true,
      efficacy: true, cri: true, cctOptions: true,
      voltage: true, dimmable: true, dimmingType: true,
      mountingType: true, dimensions: true, weight: true,
      ipRating: true, nemaRating: true, wetLocation: true,
      dampLocation: true, ulListed: true, dlcListed: true,
      dlcPremium: true, energyStar: true,
      opticalDistribution: true, applications: true, description: true,
      manufacturer: { select: { name: true } },
    },
  })

  console.log(`Found ${products.length} products to promote`)

  let promoted = 0
  let totalFieldsPromoted = 0
  let totalFieldsSkipped = 0

  for (const product of products) {
    const extraction = product.specExtractionJson as Record<string, unknown> | null
    if (!extraction) continue

    const evidenceMap = (product.specEvidenceJson ?? {}) as Record<string, string>
    const fieldConfidence = (extraction._fieldConfidence ?? {}) as Record<string, number>
    const overallConfidence = (extraction._overallConfidence as number) ?? null
    const existingProvenance = (product.fieldProvenance as Record<string, unknown>) ?? {}

    const data: Record<string, unknown> = {}
    const promotedFields: string[] = []
    const skippedFields: string[] = []
    const updatedProvenance: Record<string, unknown> = { ...existingProvenance }

    for (const [jsonKey, dbField] of Object.entries(FIELD_MAP)) {
      const rawValue = extraction[jsonKey]
      if (rawValue == null) continue

      const confidence = fieldConfidence[jsonKey] ?? 0.80
      const threshold = MIN_CONFIDENCE[jsonKey] ?? 0.80

      if (confidence < threshold) {
        skippedFields.push(`${jsonKey}(${confidence.toFixed(2)}<${threshold})`)
        totalFieldsSkipped++
        continue
      }

      // Convert to proper DB type (enum mapping, Int[] for cctOptions, etc.)
      const dbValue = convertForDb(jsonKey, rawValue)
      if (dbValue == null) {
        skippedFields.push(`${jsonKey}(unmappable value: ${JSON.stringify(rawValue)})`)
        totalFieldsSkipped++
        continue
      }

      // Merge-only check: don't overwrite existing higher-confidence values
      const existingValue = (product as Record<string, unknown>)[dbField]
      const existingProvenanceEntry = existingProvenance[dbField] as Record<string, unknown> | null
      const existingConfidence = (existingProvenanceEntry?.confidence as number) ?? 0

      if (existingValue != null && existingValue !== '' &&
          !(Array.isArray(existingValue) && (existingValue as unknown[]).length === 0)) {
        // Field already has a value — only promote if meaningfully higher confidence
        if (confidence <= existingConfidence + 0.05) {
          skippedFields.push(`${jsonKey}(existing confidence ${existingConfidence.toFixed(2)} >= new ${confidence.toFixed(2)})`)
          totalFieldsSkipped++
          continue
        }
      }

      data[dbField] = dbValue
      promotedFields.push(jsonKey)
      totalFieldsPromoted++

      // Update per-field provenance (merge, not replace)
      updatedProvenance[dbField] = {
        source: 'PDF_EXTRACTION',
        confidence,
        rawValue: rawValue,          // pre-normalization
        normalizedValue: dbValue,    // post-normalization / post-conversion
        promotedAt: new Date().toISOString(),
        evidence: evidenceMap[jsonKey] ?? null,
      }
    }

    if (Object.keys(data).length === 0) {
      if (dryRun) {
        console.log(`  ${product.manufacturer.name} | ${product.catalogNumber}: nothing to promote`)
      }
      continue
    }

    // Determine promotion status based on core fields
    const corePromoted = promotedFields.filter(f => CORE_FIELDS.has(f))
    let promotionStatus: PromotionStatus
    if (corePromoted.length === CORE_FIELDS.size) {
      promotionStatus = PromotionStatus.PROMOTED
    } else if (corePromoted.length > 0 || promotedFields.length > 0) {
      promotionStatus = PromotionStatus.PARTIAL
    } else {
      promotionStatus = PromotionStatus.SKIPPED
    }

    // Build promotion summary for UI/ops
    const promotionSummary = {
      promotedFields,
      skippedFields,
      corePromoted,
      fieldsPromotedCount: promotedFields.length,
      fieldsTotalCount: Object.keys(FIELD_MAP).length,
      overallConfidence,
      promotedAt: new Date().toISOString(),
    }

    data.specPromotedAt = new Date()
    data.specPromotionStatus = promotionStatus
    data.specPromotionSummaryJson = promotionSummary
    data.fieldProvenance = updatedProvenance

    if (dryRun) {
      console.log(`  ${product.manufacturer.name} | ${product.catalogNumber}: promote ${promotedFields.length} fields [${promotionStatus}]`)
      if (promotedFields.length > 0) console.log(`    Promoted: ${promotedFields.join(', ')}`)
      if (skippedFields.length > 0) console.log(`    Skipped:  ${skippedFields.join(', ')}`)
    } else {
      await prisma.product.update({ where: { id: product.id }, data })
    }

    promoted++
  }

  console.log(`\nDone.`)
  console.log(`  Products processed: ${promoted}`)
  console.log(`  Fields promoted:    ${totalFieldsPromoted}`)
  console.log(`  Fields skipped:     ${totalFieldsSkipped}`)
  if (dryRun) console.log('  (DRY RUN — no changes written)')
}

main().catch(console.error).finally(() => prisma.$disconnect())
