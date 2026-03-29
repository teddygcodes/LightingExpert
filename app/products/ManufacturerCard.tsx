'use client'

import { useState } from 'react'
import { COLORS } from '@/lib/design-tokens'

interface ManufacturerEntry {
  id: string
  name: string
  slug: string
  productCount: number
  categories: { id: string; name: string; slug: string }[]
}

export type { ManufacturerEntry }

export default function ManufacturerCard({ mfr, onClick }: { mfr: ManufacturerEntry; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: COLORS.surface,
        border: `1px solid ${hovered ? COLORS.accent : COLORS.border}`,
        borderLeft: `3px solid ${hovered ? COLORS.accent : COLORS.border}`,
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.12s, box-shadow 0.12s',
        boxShadow: hovered ? '0 2px 8px rgba(209,52,56,0.10)' : '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text, marginBottom: 6 }}>{mfr.name}</div>
      <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
        {mfr.productCount > 0
          ? `${mfr.productCount} fixture${mfr.productCount !== 1 ? 's' : ''}`
          : 'No fixtures yet'}
      </div>
      <div style={{ fontSize: 11, color: COLORS.textFaint }}>
        {mfr.categories.slice(0, 4).map((c) => c.name).join(' · ')}
        {mfr.categories.length > 4 ? ` · +${mfr.categories.length - 4} more` : ''}
      </div>
    </div>
  )
}
