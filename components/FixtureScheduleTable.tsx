'use client'

import { useState } from 'react'

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

  if (items.length === 0) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: '#6b6b6b', border: '1px dashed #ccc', fontSize: 13 }}>
        No fixtures added yet. Use the form below to add fixture types.
      </div>
    )
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: '#1a1a1a', color: '#fff' }}>
          <th style={{ padding: '7px 10px', textAlign: 'left', width: 50 }}>TYPE</th>
          <th style={{ padding: '7px 10px', textAlign: 'left' }}>CATALOG #</th>
          <th style={{ padding: '7px 10px', textAlign: 'left' }}>DESCRIPTION</th>
          <th style={{ padding: '7px 10px', textAlign: 'left' }}>MANUFACTURER</th>
          <th style={{ padding: '7px 10px', textAlign: 'center', width: 50 }}>QTY</th>
          <th style={{ padding: '7px 10px', textAlign: 'left' }}>LOCATION</th>
          <th style={{ padding: '7px 10px', textAlign: 'left' }}>NOTES</th>
          <th style={{ padding: '7px 10px', textAlign: 'center', width: 80 }}>ORDER</th>
          <th style={{ padding: '7px 10px', textAlign: 'center', width: 50 }}></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={item.id} style={{ background: idx % 2 === 0 ? '#f9f9f9' : '#fff', borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '7px 10px', fontWeight: 700, fontFamily: 'monospace' }}>{item.fixtureType}</td>
            <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#d13438' }}>
              {item.catalogNumberOverride ?? item.product.catalogNumber}
            </td>
            <td style={{ padding: '7px 10px', color: '#333' }}>{item.product.displayName ?? '—'}</td>
            <td style={{ padding: '7px 10px', color: '#6b6b6b' }}>{item.product.manufacturer?.name ?? '—'}</td>
            <td style={{ padding: '7px 10px', textAlign: 'center' }}>{item.quantity}</td>
            <td style={{ padding: '7px 10px', color: '#6b6b6b' }}>{item.location ?? '—'}</td>
            <td style={{ padding: '7px 10px', color: '#6b6b6b' }}>{item.notes ?? '—'}</td>
            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
              <button
                onClick={() => reorder(item.id, 'up')}
                disabled={idx === 0 || loading !== null}
                style={{ background: 'none', border: '1px solid #ccc', padding: '2px 6px', cursor: idx === 0 ? 'not-allowed' : 'pointer', marginRight: 2, opacity: idx === 0 ? 0.3 : 1 }}
              >
                ↑
              </button>
              <button
                onClick={() => reorder(item.id, 'down')}
                disabled={idx === items.length - 1 || loading !== null}
                style={{ background: 'none', border: '1px solid #ccc', padding: '2px 6px', cursor: idx === items.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === items.length - 1 ? 0.3 : 1 }}
              >
                ↓
              </button>
            </td>
            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
              <button
                onClick={() => removeItem(item.id)}
                disabled={loading !== null}
                style={{ background: 'none', border: 'none', color: '#d13438', cursor: 'pointer', fontSize: 14 }}
                title="Remove"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
