'use client'

import { useState, useRef } from 'react'

export interface FixtureRow {
  id: string
  fixtureType: string
  quantity: number
  catalogNumberOverride: string | null
  location: string | null
  notes: string | null
  sortOrder: number
  product: {
    id: string
    catalogNumber: string
    displayName: string | null
    manufacturer: { name: string } | null
  }
}

interface Props {
  submittalId: string
  items: FixtureRow[]
  onItemsChange: () => void
}

export default function FixtureScheduleTable({ submittalId, items, onItemsChange }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [editingCatalog, setEditingCatalog] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function reorder(itemId: string, direction: 'up' | 'down') {
    setLoading(itemId + direction)
    await fetch(`/api/submittals/${submittalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', itemId, direction }),
    })
    onItemsChange()
    setLoading(null)
  }

  async function removeItem(itemId: string) {
    setLoading(itemId + 'remove')
    await fetch(`/api/submittals/${submittalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_item', itemId }),
    })
    onItemsChange()
    setLoading(null)
  }

  function startEditCatalog(item: FixtureRow) {
    setEditingCatalog(item.id)
    setEditValue(item.catalogNumberOverride ?? item.product.catalogNumber)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function commitCatalogEdit(itemId: string, originalCatalog: string) {
    const trimmed = editValue.trim()
    setEditingCatalog(null)
    if (!trimmed || trimmed === originalCatalog) return
    setLoading(itemId + 'catalog')
    await fetch(`/api/submittals/${submittalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_item', itemId, catalogNumberOverride: trimmed }),
    })
    onItemsChange()
    setLoading(null)
  }

  if (items.length === 0) {
    return (
      <div className="p-[30px] text-center text-[var(--text-muted)] border border-dashed border-[var(--border-strong)] text-[13px]">
        No fixtures added yet. Use the form below to add fixture types.
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 50 }}>Type</th>
            <th>Catalog #</th>
            <th>Description</th>
            <th>Manufacturer</th>
            <th className="text-center" style={{ width: 50 }}>Qty</th>
            <th>Location</th>
            <th>Notes</th>
            <th className="text-center" style={{ width: 80 }}>Order</th>
            <th className="text-center" style={{ width: 50 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id}>
              <td className="font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{item.fixtureType}</td>
              <td
                className="cursor-pointer"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}
                title="Click to edit catalog number"
              >
                {editingCatalog === item.id ? (
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => commitCatalogEdit(item.id, item.catalogNumberOverride ?? item.product.catalogNumber)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitCatalogEdit(item.id, item.catalogNumberOverride ?? item.product.catalogNumber)
                      if (e.key === 'Escape') setEditingCatalog(null)
                    }}
                    className="text-xs w-full min-w-[120px]"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent)',
                      background: '#fff8e1',
                      border: '1px solid #f0a500',
                      padding: '1px 4px',
                    }}
                    autoFocus
                  />
                ) : (
                  <span onClick={() => startEditCatalog(item)}>
                    {item.catalogNumberOverride ?? item.product.catalogNumber}
                  </span>
                )}
              </td>
              <td className="text-[var(--text-secondary)]">{item.product.displayName ?? '—'}</td>
              <td className="text-[var(--text-muted)]">{item.product.manufacturer?.name ?? '—'}</td>
              <td className="text-center">{item.quantity}</td>
              <td className="text-[var(--text-muted)]">{item.location ?? '—'}</td>
              <td className="text-[var(--text-muted)]">{item.notes ?? '—'}</td>
              <td className="text-center">
                <button
                  onClick={() => reorder(item.id, 'up')}
                  disabled={idx === 0 || loading !== null}
                  className="bg-none border border-[var(--border-strong)] px-1.5 py-0.5 cursor-pointer mr-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↑
                </button>
                <button
                  onClick={() => reorder(item.id, 'down')}
                  disabled={idx === items.length - 1 || loading !== null}
                  className="bg-none border border-[var(--border-strong)] px-1.5 py-0.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↓
                </button>
              </td>
              <td className="text-center">
                <button
                  onClick={() => removeItem(item.id)}
                  disabled={loading !== null}
                  className="bg-none border-none text-[var(--accent)] cursor-pointer text-sm"
                  title="Remove"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
