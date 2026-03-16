'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message, ToolInvocation } from 'ai'
import ProductInlineCard from './ProductInlineCard'
import SpecSheetPreview from './SpecSheetPreview'
import type {
  SearchProductsToolResult,
  CrossReferenceToolResult,
  SpecSheetToolResult,
  AddToSubmittalToolResult,
} from '@/lib/agent/types'

interface Props {
  message: Message
  onAddToSubmittal?: (catalogNumber: string) => void
}

function ToolLoadingIndicator({ toolName }: { toolName: string }) {
  const labels: Record<string, string> = {
    search_products: 'Searching products',
    cross_reference: 'Cross-referencing',
    get_spec_sheet: 'Loading spec sheet',
    add_to_submittal: 'Adding to submittal',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', color: 'var(--text-muted)', fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        <span className="dot-1" style={{ width: 5, height: 5, background: 'var(--accent)', display: 'inline-block' }} />
        <span className="dot-2" style={{ width: 5, height: 5, background: 'var(--accent)', display: 'inline-block' }} />
        <span className="dot-3" style={{ width: 5, height: 5, background: 'var(--accent)', display: 'inline-block' }} />
      </div>
      <span>{labels[toolName] ?? `Running ${toolName}`}…</span>
    </div>
  )
}

function ConfidenceBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#15803d' : pct >= 60 ? '#b45309' : '#b91c1c'
  const bg = pct >= 80 ? '#f0fdf4' : pct >= 60 ? '#fffbeb' : '#fef2f2'
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      color, background: bg,
      padding: '2px 8px',
      border: `1px solid ${color}22`,
      flexShrink: 0,
    }}>
      {pct}%
    </span>
  )
}

function ToolResultRenderer({
  invocation,
  onAddToSubmittal,
}: {
  invocation: ToolInvocation & { state: 'result' }
  onAddToSubmittal?: (catalogNumber: string) => void
}) {
  const { toolName, result } = invocation as ToolInvocation & { state: 'result'; result: unknown }

  if (result && typeof result === 'object' && 'error' in (result as object)) {
    return (
      <div style={{
        fontSize: 13, padding: '8px 12px',
        background: 'var(--accent-dim)',
        borderLeft: '2px solid var(--accent)',
        color: 'var(--accent)',
        marginTop: 4,
      }}>
        {(result as { error: string }).error}
      </div>
    )
  }

  if (toolName === 'search_products') {
    const r = result as SearchProductsToolResult
    if (!r.products?.length) {
      return <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>No products found matching those criteria.</div>
    }
    return (
      <div style={{ marginTop: 6 }}>
        {r.products.map((p) => (
          <ProductInlineCard key={p.id} product={p} onAddToSubmittal={onAddToSubmittal} />
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
          {r.total} result{r.total !== 1 ? 's' : ''}
        </div>
      </div>
    )
  }

  if (toolName === 'cross_reference') {
    const r = result as CrossReferenceToolResult
    if (!r.matches?.length) {
      return <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>No cross-reference matches found.</div>
    }
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Equivalents found
        </div>
        {r.matches.map((m, i) => {
          const pct = Math.round(m.confidence * 100)
          const accentColor = pct >= 80 ? '#15803d' : pct >= 60 ? '#b45309' : '#b91c1c'
          return (
            <div
              key={i}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderTop: i === 0 ? `2px solid ${accentColor}` : '1px solid var(--border)',
                marginBottom: 4,
                padding: '10px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.02em' }}>
                      {m.catalogNumber}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                      {m.manufacturerSlug}
                    </span>
                  </div>
                  {m.displayName && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{m.displayName}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <ConfidenceBadge pct={pct} />
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {m.matchType.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {m.importantDifferences.length > 0 && m.importantDifferences[0] !== 'No significant differences identified' && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {m.importantDifferences.map((d, j) => (
                    <span key={j} style={{
                      fontSize: 11, color: 'var(--text-secondary)',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      padding: '2px 8px',
                    }}>
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
          {r.rejectCount} hard-rejected (incompatible specs)
        </div>
      </div>
    )
  }

  if (toolName === 'get_spec_sheet') {
    const r = result as SpecSheetToolResult
    return (
      <div style={{ marginTop: 6 }}>
        <SpecSheetPreview
          catalogNumber={r.catalogNumber}
          displayName={r.displayName}
          specSheetPath={r.specSheetPath}
          specSheets={r.specSheets}
          productPageUrl={r.productPageUrl}
        />
      </div>
    )
  }

  if (toolName === 'add_to_submittal') {
    const r = result as AddToSubmittalToolResult
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderLeft: '3px solid #15803d',
        padding: '8px 14px', fontSize: 13, marginTop: 6,
      }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M2 6.5l3 3L11 3" stroke="#15803d" strokeWidth="2" strokeLinecap="square"/>
        </svg>
        <span>
          Added <strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.catalogNumber}</strong>{' '}
          Type <strong>{r.fixtureType}</strong> ×{r.quantity} →{' '}
          <a href={`/submittals/${r.submittalId}`} style={{ color: 'var(--accent)', fontWeight: 500 }}>
            {r.submittalName}
          </a>
          {r.wasNewSubmittal && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> (new)</span>}
        </span>
      </div>
    )
  }

  return null
}

const markdownComponents = {
  p: ({ children }: { children: React.ReactNode }) => (
    <p style={{ margin: '0 0 8px', color: 'var(--text)', lineHeight: 1.65 }}>{children}</p>
  ),
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ol>
  ),
  li: ({ children }: { children: React.ReactNode }) => (
    <li style={{ marginBottom: 3, color: 'var(--text-secondary)' }}>{children}</li>
  ),
  strong: ({ children }: { children: React.ReactNode }) => (
    <strong style={{ fontWeight: 600, color: 'var(--text)' }}>{children}</strong>
  ),
  code: ({ children }: { children: React.ReactNode }) => (
    <code style={{ fontFamily: 'monospace', background: 'var(--bg)', border: '1px solid var(--border)', padding: '1px 5px', fontSize: 12 }}>
      {children}
    </code>
  ),
  h3: ({ children }: { children: React.ReactNode }) => (
    <h3 style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 4px', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</h3>
  ),
  table: ({ children }: { children: React.ReactNode }) => (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>{children}</table>
    </div>
  ),
  thead: ({ children }: { children: React.ReactNode }) => (
    <thead style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>{children}</thead>
  ),
  th: ({ children }: { children: React.ReactNode }) => (
    <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{children}</th>
  ),
  td: ({ children }: { children: React.ReactNode }) => (
    <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', verticalAlign: 'top' }}>{children}</td>
  ),
  tr: ({ children }: { children: React.ReactNode }) => (
    <tr style={{ transition: 'background 0.1s' }}>{children}</tr>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
}

export default function ChatMessage({ message, onAddToSubmittal }: Props) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="msg-animate" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <div style={{
          background: 'var(--text)',
          color: '#fff',
          padding: '10px 16px',
          maxWidth: '72%',
          fontSize: 14,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="msg-animate" style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 20 }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        padding: '12px 16px',
        maxWidth: '90%',
        minWidth: 0,
        fontSize: 14,
      }}>
        {message.content && (
          <div style={{ marginBottom: message.toolInvocations?.length ? 10 : 0 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.toolInvocations?.map((inv) => (
          <div key={inv.toolCallId}>
            {inv.state === 'call' || inv.state === 'partial-call' ? (
              <ToolLoadingIndicator toolName={inv.toolName} />
            ) : (
              <ToolResultRenderer
                invocation={inv as ToolInvocation & { state: 'result' }}
                onAddToSubmittal={onAddToSubmittal}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
