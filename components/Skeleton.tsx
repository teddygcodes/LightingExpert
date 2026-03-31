'use client'

/**
 * Loading skeleton components for perceived performance.
 * Uses CSS animation from globals.css pulse pattern.
 */

const pulseStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--bg) 25%, var(--border) 50%, var(--bg) 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-pulse 1.5s ease-in-out infinite',
}

export function SkeletonLine({ width = '100%', height = 14, style }: {
  width?: string | number
  height?: number
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        width,
        height,
        ...pulseStyle,
        ...style,
      }}
    />
  )
}

export function SkeletonCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      padding: 16,
      ...style,
    }}>
      <SkeletonLine width="60%" height={16} />
      <SkeletonLine width="40%" height={12} style={{ marginTop: 8 }} />
      <SkeletonLine width="80%" height={12} style={{ marginTop: 8 }} />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={`${100 / cols}%`} height={14} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--bg)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} width={`${100 / cols}%`} height={12} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonPdf({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--border)',
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      minHeight: 200,
      ...style,
    }}>
      <SkeletonLine width="40%" height={18} />
      <SkeletonLine width="70%" height={12} />
      <SkeletonLine width="60%" height={12} />
      <div style={{ flex: 1, width: '100%', marginTop: 16, ...pulseStyle, minHeight: 120 }} />
    </div>
  )
}
