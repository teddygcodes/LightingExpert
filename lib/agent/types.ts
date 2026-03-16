// lib/agent/types.ts
// Shared TypeScript types for the chat agent tools.

export type ToolName = 'search_products' | 'cross_reference' | 'get_spec_sheet' | 'add_to_submittal'

// ─── Tool Inputs ──────────────────────────────────────────────────────────────

export interface SearchProductsInput {
  query?: string
  manufacturer?: 'acuity' | 'cooper' | 'elite' | 'current' | 'lutron'
  categorySlug?: string
  minLumens?: number
  maxWattage?: number
  cct?: string
  minCri?: number
  environment?: 'indoor' | 'outdoor' | 'both'
  dlcListed?: boolean
  wetLocation?: boolean
  limit?: number
}

export interface CrossReferenceInput {
  catalogNumber: string
  targetManufacturer?: 'acuity' | 'cooper' | 'elite' | 'current' | 'lutron'
}

export interface GetSpecSheetInput {
  catalogNumber: string
}

export interface AddToSubmittalInput {
  catalogNumber: string
  fixtureType?: string
  quantity?: number
  location?: string
  submittalId?: string
}

// ─── Tool Results ─────────────────────────────────────────────────────────────

export interface ProductSearchResult {
  id: string
  catalogNumber: string
  displayName: string | null
  familyName: string | null
  manufacturer: { name: string; slug: string }
  wattage: number | null
  wattageMin: number | null
  wattageMax: number | null
  lumens: number | null
  lumensMin: number | null
  lumensMax: number | null
  cri: number | null
  cctOptions: number[]   // stored as integers in DB: 3000, 4000, 5000
  voltage: string | null
  dlcListed: boolean
  dlcPremium: boolean
  wetLocation: boolean
  specSheetPath: string | null
  specSheets: unknown
  productPageUrl: string | null
}

export interface SearchProductsToolResult {
  products: ProductSearchResult[]
  total: number
}

export interface CrossRefMatchResult {
  catalogNumber: string
  displayName: string | null
  manufacturerSlug: string
  confidence: number
  matchType: string
  matchReason: string
  importantDifferences: string[]
}

export interface CrossReferenceToolResult {
  source: {
    catalogNumber: string
    displayName: string | null
    manufacturer: string
    wattage: number | null
    lumens: number | null
    cri: number | null
    cctOptions: number[]
  }
  exactMatches: CrossRefMatchResult[]
  fallbackAlternatives: ProductSearchResult[]
  fallbackUsed: boolean
  fallbackInferredSpecs?: Record<string, unknown>
  rejectCount: number
  filterLevel: string
  filterDescription: string
}

export interface SpecSheetToolResult {
  catalogNumber: string
  displayName: string | null
  manufacturer: string
  specSheetPath: string | null
  specSheets: unknown        // JSON array of spec sheet entries
  productPageUrl: string | null
}

export interface AddToSubmittalToolResult {
  submittalId: string
  submittalName: string
  wasNewSubmittal: boolean
  fixtureType: string
  catalogNumber: string
  displayName: string | null
  manufacturer: string
  quantity: number
  location: string | null
  totalItems: number
}

export type ToolErrorResult = { error: string }

export type AnyToolResult =
  | SearchProductsToolResult
  | CrossReferenceToolResult
  | SpecSheetToolResult
  | AddToSubmittalToolResult
  | ToolErrorResult
