// lib/agent/types.ts
// Shared types for chat agent tool results — used by ChatMessage and ProductInlineCard.

import type { SearchProductRow } from '@/lib/products-search'

// ProductSearchResult — matches SearchProductRow from products-search
export type ProductSearchResult = SearchProductRow

// RecommendationResult — ProductSearchResult with required scoring fields
// appended by the recommend_fixtures tool
export type RecommendationResult = SearchProductRow & {
  score: number
  fitConfidence: number
  rankLabel: string
  whyRecommended: string
  tradeoffs: string | null
}

// SearchProductsToolResult — returned by the search_products tool
export type SearchProductsToolResult = {
  products: ProductSearchResult[]
  total: number
  error?: string
}

// CrossReferenceToolResult — returned by the cross_reference tool
export type CrossReferenceToolResult = {
  source: {
    catalogNumber: string
    displayName: string | null
    manufacturer: string
    wattage: number | null
    lumens: number | null
    cri: number | null
    cctOptions: number[] | null
  }
  exactMatches: Array<{
    catalogNumber: string
    displayName: string | null
    manufacturerSlug: string
    confidence: number
    matchType: string
    matchReason: string
    importantDifferences: string[]
    specSheetPath: string | null
    specSheets: unknown
  }>
  fallbackAlternatives: SearchProductRow[]
  fallbackUsed: boolean
  rejectCount: number
  filterLevel: string
  filterDescription: string
  error?: string
}

// SpecSheetToolResult — returned by the get_spec_sheet tool
export type SpecSheetToolResult = {
  catalogNumber: string
  displayName: string | null
  manufacturer: string
  specSheetPath: string | null
  specSheets: unknown
  productPageUrl: string | null
  matchType: 'exact_product_match' | 'family_spec_sheet_match'
  error?: string
}

// AddToSubmittalToolResult — returned by the add_to_submittal tool
export type AddToSubmittalToolResult = {
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
  error?: string
}

// RecommendFixturesToolResult — returned by the recommend_fixtures tool
export type RecommendFixturesToolResult = {
  recommendations: RecommendationResult[]
  context: {
    applicationType: string
    projectPosture: string
    inferredDefaults: string
  }
  evaluatedCount: number
  error?: string
}
