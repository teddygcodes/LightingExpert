'use client'

import { COLORS } from '@/lib/design-tokens'

interface BreadcrumbPart {
  label: string
  onClick?: () => void
}

export default function Breadcrumb({ parts }: { parts: BreadcrumbPart[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.textSecondary, marginBottom: 20 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: COLORS.textFaint }}>›</span>}
          {p.onClick ? (
            <button
              onClick={p.onClick}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: COLORS.accent,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              {p.label}
            </button>
          ) : (
            <span style={{ color: COLORS.text, fontWeight: 600 }}>{p.label}</span>
          )}
        </span>
      ))}
    </div>
  )
}
