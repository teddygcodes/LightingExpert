'use client'

import { COLORS } from '@/lib/design-tokens'

export default function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '56px 24px',
      color: COLORS.textSecondary,
    }}>
      <svg width={40} height={40} viewBox="0 0 40 40" fill="none" style={{ marginBottom: 16, opacity: 0.35 }}>
        <rect x={4} y={10} width={32} height={24} rx={3} stroke={COLORS.textSecondary} strokeWidth={2} />
        <path d="M4 17h32" stroke={COLORS.textSecondary} strokeWidth={2} />
        <path d="M13 10V6a7 7 0 0 1 14 0v4" stroke={COLORS.textSecondary} strokeWidth={2} />
      </svg>
      <div style={{ fontWeight: 600, fontSize: 15, color: COLORS.text, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 300 }}>{description}</div>
    </div>
  )
}
