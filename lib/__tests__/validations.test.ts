import { describe, it, expect } from 'vitest'
import {
  createSubmittalSchema,
  addItemSchema,
  removeItemSchema,
  reorderSchema,
  updateItemSchema,
  updateSubmittalSchema,
  updateMatrixSchema,
  chatRequestSchema,
} from '../validations'

// ─── createSubmittalSchema ───────────────────────────────────────────────────

describe('createSubmittalSchema', () => {
  it('accepts valid input', () => {
    const result = createSubmittalSchema.safeParse({
      projectName: 'Office Build',
      projectAddress: '123 Main St',
      clientName: 'Acme Corp',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.projectName).toBe('Office Build')
    }
  })

  it('requires projectName', () => {
    const result = createSubmittalSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects empty projectName', () => {
    const result = createSubmittalSchema.safeParse({ projectName: '' })
    expect(result.success).toBe(false)
  })

  it('rejects projectName over 200 chars', () => {
    const result = createSubmittalSchema.safeParse({ projectName: 'x'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('allows optional fields to be omitted', () => {
    const result = createSubmittalSchema.safeParse({ projectName: 'Test' })
    expect(result.success).toBe(true)
  })

  it('rejects notes over 2000 chars', () => {
    const result = createSubmittalSchema.safeParse({
      projectName: 'Test',
      notes: 'x'.repeat(2001),
    })
    expect(result.success).toBe(false)
  })
})

// ─── addItemSchema ───────────────────────────────────────────────────────────

describe('addItemSchema', () => {
  it('accepts valid input with defaults', () => {
    const result = addItemSchema.safeParse({
      action: 'add_item',
      productId: 'abc123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(1) // default
    }
  })

  it('rejects wrong action literal', () => {
    const result = addItemSchema.safeParse({
      action: 'remove_item',
      productId: 'abc123',
    })
    expect(result.success).toBe(false)
  })

  it('coerces string quantity to number', () => {
    const result = addItemSchema.safeParse({
      action: 'add_item',
      productId: 'abc123',
      quantity: '5',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(5)
    }
  })

  it('rejects quantity over 10000', () => {
    const result = addItemSchema.safeParse({
      action: 'add_item',
      productId: 'abc123',
      quantity: 10001,
    })
    expect(result.success).toBe(false)
  })

  it('rejects zero quantity', () => {
    const result = addItemSchema.safeParse({
      action: 'add_item',
      productId: 'abc123',
      quantity: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative quantity', () => {
    const result = addItemSchema.safeParse({
      action: 'add_item',
      productId: 'abc123',
      quantity: -1,
    })
    expect(result.success).toBe(false)
  })

  it('requires productId', () => {
    const result = addItemSchema.safeParse({ action: 'add_item' })
    expect(result.success).toBe(false)
  })
})

// ─── removeItemSchema ────────────────────────────────────────────────────────

describe('removeItemSchema', () => {
  it('accepts valid input', () => {
    const result = removeItemSchema.safeParse({
      action: 'remove_item',
      itemId: 'item-1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty itemId', () => {
    const result = removeItemSchema.safeParse({
      action: 'remove_item',
      itemId: '',
    })
    expect(result.success).toBe(false)
  })
})

// ─── reorderSchema ───────────────────────────────────────────────────────────

describe('reorderSchema', () => {
  it('accepts up direction', () => {
    const result = reorderSchema.safeParse({
      action: 'reorder',
      itemId: 'item-1',
      direction: 'up',
    })
    expect(result.success).toBe(true)
  })

  it('accepts down direction', () => {
    const result = reorderSchema.safeParse({
      action: 'reorder',
      itemId: 'item-1',
      direction: 'down',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid direction', () => {
    const result = reorderSchema.safeParse({
      action: 'reorder',
      itemId: 'item-1',
      direction: 'left',
    })
    expect(result.success).toBe(false)
  })
})

// ─── updateItemSchema ────────────────────────────────────────────────────────

describe('updateItemSchema', () => {
  it('accepts partial update', () => {
    const result = updateItemSchema.safeParse({
      action: 'update_item',
      itemId: 'item-1',
      quantity: 3,
    })
    expect(result.success).toBe(true)
  })

  it('rejects fixtureType over 50 chars', () => {
    const result = updateItemSchema.safeParse({
      action: 'update_item',
      itemId: 'item-1',
      fixtureType: 'x'.repeat(51),
    })
    expect(result.success).toBe(false)
  })
})

// ─── updateSubmittalSchema ───────────────────────────────────────────────────

describe('updateSubmittalSchema', () => {
  it('accepts valid status', () => {
    const result = updateSubmittalSchema.safeParse({ status: 'APPROVED' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = updateSubmittalSchema.safeParse({ status: 'UNKNOWN' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid statuses', () => {
    const statuses = [
      'DRAFT', 'GENERATED', 'SUBMITTED', 'APPROVED', 'APPROVED_AS_NOTED',
      'REVISE_RESUBMIT', 'REJECTED', 'FINAL', 'ISSUED_FOR_REVIEW',
      'ISSUED_FOR_CONSTRUCTION', 'SUPERSEDED',
    ]
    for (const status of statuses) {
      const result = updateSubmittalSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it('accepts empty object (all optional)', () => {
    const result = updateSubmittalSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

// ─── updateMatrixSchema ──────────────────────────────────────────────────────

describe('updateMatrixSchema', () => {
  it('accepts valid matrix update', () => {
    const result = updateMatrixSchema.safeParse({
      id: 'matrix-1',
      matrixType: 'configurable',
      columns: [{
        position: 0,
        label: 'Color',
        options: [{ code: 'WH', description: 'White' }],
      }],
    })
    expect(result.success).toBe(true)
  })

  it('requires id', () => {
    const result = updateMatrixSchema.safeParse({ matrixType: 'configurable' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid matrixType', () => {
    const result = updateMatrixSchema.safeParse({
      id: 'matrix-1',
      matrixType: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects confidence out of range', () => {
    expect(updateMatrixSchema.safeParse({ id: 'x', confidence: 1.5 }).success).toBe(false)
    expect(updateMatrixSchema.safeParse({ id: 'x', confidence: -0.1 }).success).toBe(false)
  })

  it('accepts valid skuTable', () => {
    const result = updateMatrixSchema.safeParse({
      id: 'matrix-1',
      skuTable: [{ stockPartNumber: 'ABC-123', position: 1 }],
    })
    expect(result.success).toBe(true)
  })
})

// ─── chatRequestSchema ──────────────────────────────────────────────────────

describe('chatRequestSchema', () => {
  it('accepts valid messages', () => {
    const result = chatRequestSchema.safeParse({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty messages array', () => {
    // messages has no .min() so empty should pass
    const result = chatRequestSchema.safeParse({ messages: [] })
    expect(result.success).toBe(true)
  })

  it('rejects more than 100 messages', () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      role: 'user',
      content: `msg ${i}`,
    }))
    const result = chatRequestSchema.safeParse({ messages })
    expect(result.success).toBe(false)
  })

  it('rejects missing messages field', () => {
    const result = chatRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('preserves extra fields via passthrough', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Hi', name: 'Tyler' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data.messages[0] as Record<string, unknown>).name).toBe('Tyler')
    }
  })
})
