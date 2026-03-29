'use client'

import { useState } from 'react'
import { COLORS } from '@/lib/design-tokens'

export interface Category {
  id: string
  name: string
  slug: string
  path: string | null
  sortOrder: number
  parentId: string | null
  children: Category[]
  directProductCount: number
  childCategoryCount: number
  descendantProductCount: number
}

export default function CategoryCard({
  cat,
  onClick,
  onViewAll,
}: {
  cat: Category
  onClick: () => void
  onViewAll: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const hasChildren = cat.childCategoryCount > 0

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: COLORS.surface,
        border: `1px solid ${hovered ? COLORS.accent : COLORS.border}`,
        borderLeft: `3px solid ${hovered ? COLORS.accent : COLORS.border}`,
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'border-color 0.12s, box-shadow 0.12s',
        boxShadow: hovered ? '0 2px 8px rgba(209,52,56,0.10)' : '0 1px 2px rgba(0,0,0,0.04)',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: COLORS.text }}>{cat.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
          <span style={{
            fontSize: 11,
            background: '#fde7e9',
            color: COLORS.accent,
            padding: '2px 8px',
            borderRadius: 10,
            fontWeight: 600,
          }}>
            {hasChildren ? `${cat.childCategoryCount} sub` : cat.directProductCount}
          </span>
          {hasChildren && <span style={{ color: COLORS.textFaint, fontSize: 14 }}>›</span>}
        </div>
      </div>

      {cat.descendantProductCount > 0 && (
        <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 8 }}>
          {cat.descendantProductCount} total fixture{cat.descendantProductCount !== 1 ? 's' : ''} in branch
        </div>
      )}

      {hasChildren && cat.descendantProductCount > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onViewAll() }}
          style={{
            marginTop: 10,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: COLORS.accent,
            fontSize: 11,
            textDecoration: 'underline',
          }}
        >
          View all {cat.descendantProductCount} fixtures →
        </button>
      )}
    </div>
  )
}
