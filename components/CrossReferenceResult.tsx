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
    <div className="table-wrap mt-2">
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Source</th>
            <th>Target</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([field, delta]) => (
            <tr key={field}>
              <td className="text-[var(--text-muted)] uppercase text-[11px]">{field}</td>
              <td className="text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
                {String((snapshot.source[field] as string | number | boolean | null) ?? '—')}
              </td>
              <td className="text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
                {String((snapshot.target[field] as string | number | boolean | null) ?? '—')}
              </td>
              <td className="text-[11px]">{delta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MatchCard({ match }: MatchCardProps) {
  const { color, bg } = confidenceStyle(match.confidence)
  const pct = Math.round(match.confidence * 100)

  return (
    <div className="p-4 mb-2.5" style={{ border: `1px solid ${color}`, background: bg }}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="font-bold text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
            {match.catalogNumber}
          </span>
          {match.displayName && (
            <span className="text-xs text-[var(--text-muted)] ml-2">{match.displayName}</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-xl font-bold" style={{ color }}>{pct}%</div>
          <div className="text-[11px] text-[var(--text-muted)]">{match.matchType.replace(/_/g, ' ')}</div>
        </div>
      </div>

      {match.matchReason && (
        <div className="text-xs text-[var(--text)] mb-2 leading-relaxed">
          {match.matchReason}
        </div>
      )}

      <DeltaTable snapshot={match.comparisonSnapshot} />

      <div className="mt-2.5">
        <a
          href={`/products?search=${encodeURIComponent(match.catalogNumber)}`}
          className="text-xs text-[var(--blue,#0078d4)]"
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
    <div className="border border-[var(--border)] bg-white p-2.5 px-3.5 mb-1.5 flex justify-between items-center">
      <div>
        <span className="text-[13px] font-semibold text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {reject.catalogNumber}
        </span>
        <span className="text-[11px] text-[var(--text-faint)] ml-2">{reject.detail}</span>
      </div>
      <span className="text-[10px] bg-[var(--accent)] text-white px-1.5 py-0.5 whitespace-nowrap shrink-0 ml-3">
        {reject.reason.replace(/_/g, ' ')}
      </span>
    </div>
  )
}
