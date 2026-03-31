'use client'

export interface SpecRow {
  label: string
  value: unknown
}

interface SpecSectionProps {
  title: string
  rows: SpecRow[]
}

function formatValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return value.toLocaleString()
  if (Array.isArray(value)) {
    const items = value.filter(v => v != null && v !== '')
    return items.length > 0 ? items.join(', ') : null
  }
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

export default function SpecSection({ title, rows }: SpecSectionProps) {
  const visibleRows = rows.filter(r => {
    if (r.value == null) return false
    if (r.value === '') return false
    if (Array.isArray(r.value) && r.value.length === 0) return false
    return true
  })

  if (visibleRows.length === 0) return null

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-faint)',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {visibleRows.map((row, i) => {
          const formatted = formatValue(row.value)
          if (!formatted) return null
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 13,
                lineHeight: '1.4',
              }}
            >
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{row.label}</span>
              <span
                style={{
                  color: 'var(--text)',
                  fontWeight: 500,
                  textAlign: 'right',
                  wordBreak: 'break-word',
                }}
              >
                {formatted}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
