// lib/extract-matrix.ts
//
// Shared Claude-based ordering matrix extraction logic used by:
//   - scripts/extract-ordering-matrices.ts (batch CLI)
//   - app/api/products/[id]/configurator/route.ts (on-demand)

import Anthropic from '@anthropic-ai/sdk'
import { validateMatrixFieldPresence } from './configurator'

const MAX_SPEC_TEXT_LENGTH = 80_000

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedMatrix {
  found: boolean
  matrixType?: 'configurable' | 'sku_table' | 'hybrid'
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

// ─── Prompt ──────────────────────────────────────────────────────────────────

export function buildExtractionPrompt(specText: string, familyName: string, catalogNumber: string): string {
  const truncated = specText.slice(0, MAX_SPEC_TEXT_LENGTH)
  return `You are extracting ordering/catalog information from a lighting spec sheet. Work in three phases.

Product family: ${familyName}
Representative catalog number: ${catalogNumber}

---
PHASE 1 — DETECTION: Classify this spec sheet into exactly one matrixType:

- "sku_table": The spec sheet has ONLY a table of pre-built stock part numbers. Each row IS a complete orderable part number — no separate columns of options to pick and combine to build a number. No ordering matrix section exists.

- "configurable": The spec sheet has an ordering matrix with distinct columns of options (one code to pick per column to build a complete catalog string). No pre-built stock part table.

- "hybrid": The spec sheet has BOTH a pre-built SKU table of orderable part numbers AND either (a) a separate ordering matrix section WITH DISTINCT OPTION COLUMNS physically printed on this spec sheet, OR (b) language that clearly implies further configurations exist and the ordering matrix is described somewhere on the sheet itself.

  IMPORTANT: Do NOT classify as "hybrid" if the only hint of additional options is a hyperlink or website redirect (e.g. "Click here", "visit www.acuitybrands.com", "search for [family] online"). A link to an external website is NOT an ordering matrix. If the spec sheet has a SKU table plus only a web link for "more configurations", classify as "sku_table" — the ordering matrix is not present on this document.

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

// ─── Validation ──────────────────────────────────────────────────────────────

function validateConfigurableColumns(parsed: ExtractedMatrix): string[] {
  const errors: string[] = []

  if (!parsed.baseFamily || parsed.baseFamily.trim() === '') errors.push('baseFamily is empty')

  if (!Array.isArray(parsed.columns) || parsed.columns.length === 0) {
    errors.push('no columns found')
  } else {
    const positions = parsed.columns.map(c => c.position).sort((a, b) => a - b)
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i) { errors.push(`column positions not sequential: expected ${i}, got ${positions[i]}`); break }
    }
    for (const col of parsed.columns) {
      if (col.required && (!col.options || col.options.length === 0)) errors.push(`required column "${col.label}" has no options`)
      col.options = (col.options ?? []).filter(opt => opt.code && opt.code.trim() !== '')
      if (col.required && col.options.length === 0) errors.push(`required column "${col.label}" has no valid options after filtering empty codes`)
      const codes = new Set<string>()
      for (const opt of col.options) {
        if (codes.has(opt.code)) errors.push(`duplicate option code "${opt.code}" in column "${col.label}"`)
        codes.add(opt.code)
      }
    }
    if (parsed.sampleNumber && parsed.separator) {
      const sampleSegments = parsed.sampleNumber.split(parsed.separator)
      const requiredColumns = parsed.columns.filter(c => c.required)
      if (Math.abs(sampleSegments.length - requiredColumns.length) > 2) {
        console.warn(`[extract-matrix] Sample number has ${sampleSegments.length} segments but ${requiredColumns.length} required columns — possible mismatch (non-fatal)`)
      }
      if (!parsed.sampleNumber.startsWith(parsed.baseFamily ?? '')) {
        console.warn(`[extract-matrix] Sample number "${parsed.sampleNumber}" doesn't start with baseFamily "${parsed.baseFamily}" (non-fatal)`)
      }
    }
  }

  if (parsed.suffixOptions) {
    const suffixCodes = new Set<string>()
    for (const suf of parsed.suffixOptions) {
      if (!suf.code || suf.code.trim() === '') errors.push('empty suffix option code')
      if (suffixCodes.has(suf.code)) errors.push(`duplicate suffix code "${suf.code}"`)
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
    if (!entry.stockPartNumber || entry.stockPartNumber.trim() === '') errors.push(`skuEntry at position ${entry.position} has empty stockPartNumber`)
    if (typeof entry.position !== 'number' || entry.position <= 0) errors.push(`skuEntry at index ${i} has invalid position ${entry.position} (must be > 0)`)
  })
  return errors
}

function reclassifyIfNeeded(parsed: ExtractedMatrix): void {
  if (parsed.matrixType === 'hybrid' && (!Array.isArray(parsed.columns) || parsed.columns.length === 0)) {
    parsed.matrixType = 'sku_table'
    delete parsed.columns
  }
}

function validateMatrix(parsed: ExtractedMatrix): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const matrixType = parsed.matrixType ?? 'configurable'
  const presenceError = validateMatrixFieldPresence(
    matrixType,
    Array.isArray(parsed.columns) && parsed.columns.length > 0,
    Array.isArray(parsed.skuEntries) && parsed.skuEntries.length > 0
  )
  if (presenceError) return { valid: false, errors: [presenceError] }

  if (matrixType === 'sku_table') errors.push(...validateSkuEntries(parsed))
  else if (matrixType === 'configurable') errors.push(...validateConfigurableColumns(parsed))
  else if (matrixType === 'hybrid') { errors.push(...validateConfigurableColumns(parsed)); errors.push(...validateSkuEntries(parsed)) }

  return { valid: errors.length === 0, errors }
}

// ─── Main extraction function ─────────────────────────────────────────────────

export async function extractOrderingMatrixFromSpec(
  rawSpecText: string,
  familyName: string,
  catalogNumber: string,
): Promise<ExtractedMatrix | null> {
  if (!rawSpecText || rawSpecText.length < 100) return null

  const anthropic = new Anthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: buildExtractionPrompt(rawSpecText, familyName, catalogNumber),
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(cleaned) as ExtractedMatrix

  if (!parsed.found) return null

  reclassifyIfNeeded(parsed)
  const { valid, errors } = validateMatrix(parsed)
  if (!valid) {
    console.warn(`[extract-matrix] Validation failed for "${familyName}": ${errors.join('; ')}`)
    return null
  }

  return parsed
}
