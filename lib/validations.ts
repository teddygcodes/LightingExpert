import { z } from 'zod'
import { apiError } from './api-response'

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function zodError(result: z.SafeParseError<unknown>) {
  const issue = result.error.issues[0]
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
  return apiError(`${path}${issue.message}`, 400)
}

// ─── Submittal Schemas ───────────────────────────────────────────────────────

export const createSubmittalSchema = z.object({
  projectName: z.string().min(1, 'projectName is required').max(200),
  projectAddress: z.string().max(500).optional(),
  clientName: z.string().max(200).optional(),
  contractorName: z.string().max(200).optional(),
  preparedBy: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
})

const submittalStatusValues = [
  'DRAFT', 'GENERATED', 'SUBMITTED', 'APPROVED', 'APPROVED_AS_NOTED',
  'REVISE_RESUBMIT', 'REJECTED', 'FINAL', 'ISSUED_FOR_REVIEW',
  'ISSUED_FOR_CONSTRUCTION', 'SUPERSEDED',
] as const

export const addItemSchema = z.object({
  action: z.literal('add_item'),
  productId: z.string().min(1, 'productId is required'),
  fixtureType: z.string().max(50).optional(),
  quantity: z.coerce.number().int().positive().max(10000).optional().default(1),
  locationTag: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  mountingHeight: z.number().optional(),
  notes: z.string().max(1000).optional(),
  catalogNumberOverride: z.string().max(200).optional(),
})

export const removeItemSchema = z.object({
  action: z.literal('remove_item'),
  itemId: z.string().min(1, 'itemId is required'),
})

export const reorderSchema = z.object({
  action: z.literal('reorder'),
  itemId: z.string().min(1, 'itemId is required'),
  direction: z.enum(['up', 'down']),
})

export const updateItemSchema = z.object({
  action: z.literal('update_item'),
  itemId: z.string().min(1, 'itemId is required'),
  fixtureType: z.string().max(50).optional(),
  quantity: z.coerce.number().int().positive().max(10000).optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  catalogNumberOverride: z.string().max(200).optional(),
})

export const updateSubmittalSchema = z.object({
  projectName: z.string().max(200).optional(),
  projectNumber: z.string().max(100).optional(),
  projectAddress: z.string().max(500).optional(),
  clientName: z.string().max(200).optional(),
  contractorName: z.string().max(200).optional(),
  preparedBy: z.string().max(200).optional(),
  preparedFor: z.string().max(200).optional(),
  revision: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(submittalStatusValues).optional(),
})

// ─── Admin Matrix Schema ─────────────────────────────────────────────────────

export const updateMatrixSchema = z.object({
  id: z.string().min(1, 'id is required'),
  matrixType: z.enum(['configurable', 'sku_table', 'hybrid']).optional(),
  columns: z.array(z.object({
    position: z.number(),
    label: z.string().optional(),
    options: z.array(z.object({
      code: z.string(),
      description: z.string().optional(),
    })),
  })).optional(),
  suffixOptions: z.any().optional(),
  skuTable: z.array(z.object({
    stockPartNumber: z.string().min(1),
    position: z.number().positive(),
  }).passthrough()).optional(),
  sampleNumber: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
})

// ─── Chat Schema ─────────────────────────────────────────────────────────────

export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.any(),
  }).passthrough()).max(100, 'Too many messages (max 100)'),
})
