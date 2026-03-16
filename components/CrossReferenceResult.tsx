import type { CrossRefMatch, CrossRefReject, ComparisonSnapshot } from '@/lib/types'

interface MatchCardProps {
  match: CrossRefMatch
}

function confidenceStyle(score: number) {
  if (score >= 0.8) return { color: '#107c10', bg: '#f0fff0' }
  if (score >= 0.6) return { color: '#f7a600', bg: '#fffbf0' }
  return { color: '#d13438', bg: '#fff5f5' }
}

function DeltaTable({ snapshot }: { snapshot: ComparisonSnapshot }) {
  const entries = Object.entries(snapshot.deltas)
  if (entries.length === 0) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
      <thead>
        <tr style={{ background: '#f3f3f3' }}>
          <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Field</th>
          <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Source</th>
          <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Target</th>
          <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Delta</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([field, delta]) => (
          <tr key={field} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={{ padding: '3px 8px', color: '#6b6b6b', textTransform: 'uppercase', fontSize: 11 }}>{field}</td>
            <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: 11 }}>
              {String((snapshot.source[field] as string | number | boolean | null) ?? '—')}
            </td>
            <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: 11 }}>
              {String((snapshot.target[field] as string | number | boolean | null) ?? '—')}
            </td>
            <td style={{ padding: '3px 8px', fontSize: 11 }}>{delta}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function MatchCard({ match }: MatchCardProps) {
  const { color, bg } = confidenceStyle(match.confidence)
  const pct = Math.round(match.confidence * 100)

  return (
    <div style={{
      border: `1px solid ${color}`,
      background: bg,
      padding: 16,
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>
            {match.catalogNumber}
          </span>
          {match.displayName && (
            <span style={{ fontSize: 12, color: '#6b6b6b', marginLeft: 8 }}>{match.displayName}</span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color }}>{pct}%</div>
          <div style={{ fontSize: 11, color: '#6b6b6b' }}>{match.matchType.replace(/_/g, ' ')}</div>
        </div>
      </div>

      {match.matchReason && (
        <div style={{ fontSize: 12, color: '#1a1a1a', marginBottom: 8, lineHeight: 1.5 }}>
          {match.matchReason}
        </div>
      )}

      <DeltaTable snapshot={match.comparisonSnapshot} />

      <div style={{ marginTop: 10 }}>
        <a
          href={`/products?search=${encodeURIComponent(match.catalogNumber)}`}
          style={{ fontSize: 12, color: '#0078d4', textDecoration: 'none' }}
        >
          View Product →
        </a>
      </div>
    </div>
  )
}

interface RejectCardProps {
  reject: CrossRefReject
}

export function RejectCard({ reject }: RejectCardProps) {
  return (
    <div style={{
      border: '1px solid #e0e0e0',
      background: '#f9f9f9',
      padding: '10px 14px',
      marginBottom: 6,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div>
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#6b6b6b' }}>
          {reject.catalogNumber}
        </span>
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>{reject.detail}</span>
      </div>
      <span style={{
        fontSize: 10,
        background: '#d13438',
        color: '#fff',
        padding: '2px 6px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        marginLeft: 12,
      }}>
        {reject.reason.replace(/_/g, ' ')}
      </span>
    </div>
  )
}
