// lib/configurator.ts
// Shared utilities for building and parsing catalog strings from ordering matrices.
// Used by both the configurator API and the ProductConfigurator React component.

export interface OrderingColumn {
  position: number
  label: string
  shortLabel: string
  required: boolean
  options: OrderingOption[]
}

export interface OrderingOption {
  code: string
  description: string
  isDefault?: boolean
  notes?: string
  constraints?: string[]
}

export interface SuffixOption {
  code: string
  description: string
  notes?: string
  constraints?: string[]
}

export interface OrderingMatrixData {
  id: string
  baseFamily: string
  separator: string
  sampleNumber: string | null
  columns: OrderingColumn[]
  suffixOptions: SuffixOption[]
}

export interface BuildResult {
  catalogString: string
  isComplete: boolean
  missingColumns: string[]   // labels of required but unselected columns
  warnings: string[]         // constraint text from selected options
  segments: Array<{
    position: number
    label: string
    code: string
    description: string
  }>
  suffixes: Array<{
    code: string
    description: string
  }>
}

export interface ParseResult {
  columnSelections: Record<string, string>  // position (as string) → code
  suffixSelections: string[]
  unparsed: string[]
  confidence: number  // 0–1, fraction of required columns matched
}

/**
 * Build a catalog string from column and suffix selections.
 * Column codes are joined in position order. Suffix codes are appended after.
 * Constraint warnings: if any selected option has constraints[], all are surfaced as warnings.
 */
export function buildCatalogString(
  matrix: OrderingMatrixData,
  columnSelections: Record<string, string>,
  suffixSelections: string[]
): BuildResult {
  const sorted = [...matrix.columns].sort((a, b) => a.position - b.position)

  // Missing required columns
  const missingColumns = sorted
    .filter(col => col.required && !columnSelections[String(col.position)])
    .map(col => col.label)

  // Build segments from selections
  const segments = sorted
    .filter(col => columnSelections[String(col.position)] !== undefined && columnSelections[String(col.position)] !== '')
    .map(col => {
      const code = columnSelections[String(col.position)]
      const opt = col.options.find(o => o.code === code)
      return {
        position: col.position,
        label: col.shortLabel,
        code,
        description: opt?.description ?? '',
      }
    })

  // Collect constraint warnings from selected options
  const warnings: string[] = []
  for (const col of sorted) {
    const code = columnSelections[String(col.position)]
    if (!code) continue
    const opt = col.options.find(o => o.code === code)
    if (opt?.constraints && opt.constraints.length > 0) {
      warnings.push(...opt.constraints)
    }
  }
  // Also check suffix constraints
  for (const sufCode of suffixSelections) {
    const suf = (matrix.suffixOptions ?? []).find(s => s.code === sufCode)
    if (suf?.constraints && suf.constraints.length > 0) {
      warnings.push(...suf.constraints)
    }
  }

  const columnCodes = segments.map(s => s.code)
  const allCodes = [...columnCodes, ...suffixSelections]
  const catalogString = allCodes.join(matrix.separator)

  const suffixes = suffixSelections.map(code => {
    const opt = (matrix.suffixOptions ?? []).find(s => s.code === code)
    return { code, description: opt?.description ?? '' }
  })

  return {
    catalogString,
    isComplete: missingColumns.length === 0 && segments.length > 0,
    missingColumns,
    warnings,
    segments,
    suffixes,
  }
}

/**
 * Best-effort parse an existing catalog string back into column and suffix selections.
 * Splits by separator, matches segments left-to-right against column options (position order),
 * then checks remaining segments against suffix codes.
 * Returns confidence = fraction of required columns that were matched.
 */
export function parseExistingCatalog(
  catalogString: string,
  matrix: OrderingMatrixData
): ParseResult {
  const segments = catalogString.split(matrix.separator)
  const sorted = [...matrix.columns].sort((a, b) => a.position - b.position)

  const columnSelections: Record<string, string> = {}
  const matchedSegmentIndices = new Set<number>()

  // Match segments left-to-right against columns in position order
  let segIdx = 0
  for (const col of sorted) {
    if (segIdx >= segments.length) break
    const seg = segments[segIdx]
    const match = col.options.find(o => o.code.toLowerCase() === seg.toLowerCase())
    if (match) {
      columnSelections[String(col.position)] = match.code
      matchedSegmentIndices.add(segIdx)
      segIdx++
    }
    // If no match for this column, still advance segIdx to try next segment
    // (lenient: skip unrecognized segments)
  }

  // Remaining unmatched segments — check against suffix codes
  const suffixSelections: string[] = []
  const unparsed: string[] = []
  for (let i = 0; i < segments.length; i++) {
    if (matchedSegmentIndices.has(i)) continue
    const seg = segments[i]
    const suf = (matrix.suffixOptions ?? []).find(s => s.code.toLowerCase() === seg.toLowerCase())
    if (suf) {
      suffixSelections.push(suf.code)
    } else {
      unparsed.push(seg)
    }
  }

  const requiredColumns = sorted.filter(c => c.required)
  const matchedRequired = requiredColumns.filter(c => columnSelections[String(c.position)])
  const confidence = requiredColumns.length > 0 ? matchedRequired.length / requiredColumns.length : 0

  return { columnSelections, suffixSelections, unparsed, confidence }
}
