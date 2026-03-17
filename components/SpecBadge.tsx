'use client'

export type BadgeVariant = 'fixture' | 'dlc' | 'dlc-premium' | 'wet' | 'energy-star' | 'status-success' | 'status-partial' | 'status-failed' | 'status-suspicious'

const VARIANT_STYLES: Record<BadgeVariant, { background: string; color: string }> = {
  fixture:          { background: '#e6f7f5', color: '#0d7a6e' },
  dlc:              { background: '#e6f4ec', color: '#1a6e35' },
  'dlc-premium':    { background: '#d4edda', color: '#145a27' },
  wet:              { background: '#e3f0fc', color: '#1557a0' },
  'energy-star':    { background: '#e6f4ec', color: '#1a6e35' },
  'status-success': { background: '#e6f4ec', color: '#1a6e35' },
  'status-partial': { background: '#fff3cd', color: '#7d5a00' },
  'status-failed':  { background: '#fde8e8', color: '#b91c1c' },
  'status-suspicious': { background: '#fef3c7', color: '#92400e' },
}

interface SpecBadgeProps {
  label: string
  variant: BadgeVariant
}

export default function SpecBadge({ label, variant }: SpecBadgeProps) {
  const style = VARIANT_STYLES[variant] ?? VARIANT_STYLES.fixture
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: style.background,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
