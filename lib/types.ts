// Central type definitions for Atlantis KB Lighting Expert

// ─── Field Provenance ─────────────────────────────────────────────────────────

export type ProvenanceSource = 'REGEX' | 'AI_FALLBACK' | 'MANUAL' | 'EMPTY'

export interface FieldProvenance {
  source: ProvenanceSource
  confidence: number // 0-1
  rawValue?: string  // original extracted string before normalization
}

// Keys correspond to Product fields that have provenance tracking
export type FieldProvenanceMap = Record<string, FieldProvenance>

// ─── Crawl ────────────────────────────────────────────────────────────────────

export interface CrawlEvidence {
  pageUrl?: string
  pageTitle?: string
  crawlCatalogCandidate?: string      // initial candidate derived from URL slug
  attemptedPdfUrls?: string[]         // all tried URLs (success or fail)
  discoveredPdfUrl?: string           // winning PDF URL
  pdfDownloadSuccess?: boolean
  parseMethod?: 'pdf' | 'pdf+html' | 'html_only'
  fieldCountExtracted?: number
  extractionConfidence?: number       // 0–1, normalized parse confidence for ranking
  errors?: string[]                   // failures, warnings, parse errors only
  unmappedValues?: Record<string, string>
}

export interface CrawlResult {
  productsFound: number
  productsNew: number
  productsUpdated: number
  productsCached: number
  parseFailures: number
  avgConfidence: number
  errors: string[]
}

// ─── Cross-Reference ──────────────────────────────────────────────────────────

export type HardRejectReason =
  | 'environment_mismatch'
  | 'emergency_mismatch'
  | 'wet_location_required'
  | 'nema_downgrade'
  | 'voltage_incompatible'
  | 'mounting_incompatible'
  | 'form_factor_incompatible'
  | 'category_mismatch'

export interface CrossRefMatch {
  productId: string
  catalogNumber: string
  displayName: string | null
  manufacturerSlug: string
  confidence: number
  matchType: string
  matchReason: string
  comparisonSnapshot: ComparisonSnapshot
}

export interface CrossRefReject {
  productId: string
  catalogNumber: string
  reason: HardRejectReason
  detail: string
}

export interface ComparisonSnapshot {
  source: Record<string, unknown>
  target: Record<string, unknown>
  deltas: Record<string, string>
}

// ─── API Response Envelopes ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface ApiError {
  error: string
  details?: string
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

export interface SubmittalGenerateResult {
  pdfUrl: string
  warnings: string[]
}
