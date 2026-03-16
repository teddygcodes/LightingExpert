'use client'

import ReactMarkdown from 'react-markdown'
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
    search_products: '🔍 Searching products…',
    cross_reference: '🔄 Cross-referencing…',
    get_spec_sheet: '📄 Loading spec sheet…',
    add_to_submittal: '📋 Adding to submittal…',
  }
  return (
    <div
      style={{
        color: '#888',
        fontSize: 12,
        fontStyle: 'italic',
        padding: '4px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span>⟳</span>
      {labels[toolName] ?? `Running ${toolName}…`}
    </div>
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

  // Error result
  if (result && typeof result === 'object' && 'error' in (result as object)) {
    return (
      <div
        style={{
          color: '#c0392b',
          fontSize: 12,
          padding: '6px 10px',
          background: '#fdf3f3',
          border: '1px solid #f5c6cb',
        }}
      >
        ⚠️ {(result as { error: string }).error}
      </div>
    )
  }

  if (toolName === 'search_products') {
    const r = result as SearchProductsToolResult
    if (!r.products?.length) {
      return (
        <div style={{ color: '#888', fontSize: 12 }}>
          No products found matching those criteria.
        </div>
      )
    }
    return (
      <div>
        {r.products.map((p) => (
          <ProductInlineCard key={p.id} product={p} onAddToSubmittal={onAddToSubmittal} />
        ))}
      </div>
    )
  }

  if (toolName === 'cross_reference') {
    const r = result as CrossReferenceToolResult
    if (!r.matches?.length) {
      return (
        <div style={{ color: '#888', fontSize: 12 }}>
          No cross-reference matches found.
        </div>
      )
    }
    return (
      <div>
        {r.matches.map((m, i) => {
          const confidencePct = Math.round(m.confidence * 100)
          const borderColor =
            confidencePct >= 80 ? '#27ae60' : confidencePct >= 60 ? '#e67e22' : '#e74c3c'
          return (
            <div
              key={i}
              style={{
                border: `1px solid ${borderColor}`,
                marginBottom: 8,
                padding: '8px 12px',
                fontSize: 13,
                background: '#fff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 4,
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                  {m.catalogNumber}
                </span>
                <span style={{ fontSize: 11, color: borderColor, fontWeight: 600 }}>
                  {confidencePct}% — {m.matchType.replace(/_/g, ' ')}
                </span>
              </div>
              {m.displayName && (
                <div style={{ color: '#555', fontSize: 12, marginBottom: 4 }}>
                  {m.displayName}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                Manufacturer: {m.manufacturerSlug}
              </div>
              {m.importantDifferences.length > 0 &&
                m.importantDifferences[0] !== 'No significant differences identified' && (
                  <div style={{ marginTop: 6 }}>
                    <div
                      style={{ fontSize: 11, fontWeight: 600, color: '#444', marginBottom: 2 }}
                    >
                      Differences:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#555' }}>
                      {m.importantDifferences.map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )
        })}
        <div style={{ fontSize: 11, color: '#999' }}>
          {r.rejectCount} products hard-rejected (incompatible specs)
        </div>
      </div>
    )
  }

  if (toolName === 'get_spec_sheet') {
    const r = result as SpecSheetToolResult
    return (
      <SpecSheetPreview
        catalogNumber={r.catalogNumber}
        displayName={r.displayName}
        specSheetPath={r.specSheetPath}
        specSheets={r.specSheets}
        productPageUrl={r.productPageUrl}
      />
    )
  }

  if (toolName === 'add_to_submittal') {
    const r = result as AddToSubmittalToolResult
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: '#e6f4ea',
          border: '1px solid #a8d5b0',
          padding: '6px 12px',
          fontSize: 12,
        }}
      >
        <span style={{ color: '#27ae60', fontWeight: 700 }}>✓</span>
        <span>
          Added{' '}
          <strong style={{ fontFamily: 'monospace' }}>{r.catalogNumber}</strong> as Type{' '}
          <strong>{r.fixtureType}</strong> (qty {r.quantity}) to{' '}
          <a href={`/submittals/${r.submittalId}`} style={{ color: '#d13438' }}>
            {r.submittalName}
          </a>
          {r.wasNewSubmittal && (
            <em style={{ color: '#888' }}> (new submittal created)</em>
          )}
        </span>
      </div>
    )
  }

  return null
}

export default function ChatMessage({ message, onAddToSubmittal }: Props) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div
          style={{
            background: '#1a1a1a',
            color: '#fff',
            padding: '10px 14px',
            maxWidth: '70%',
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
      <div
        style={{
          background: '#fff',
          border: '1px solid #e8e8e8',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          padding: '10px 14px',
          maxWidth: '85%',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {/* Text content */}
        {message.content && (
          <div style={{ marginBottom: message.toolInvocations?.length ? 10 : 0 }}>
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p style={{ margin: '0 0 8px' }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ marginBottom: 2 }}>{children}</li>
                ),
                strong: ({ children }) => (
                  <strong style={{ fontWeight: 600 }}>{children}</strong>
                ),
                code: ({ children }) => (
                  <code
                    style={{
                      fontFamily: 'monospace',
                      background: '#f0f0f0',
                      padding: '1px 4px',
                      fontSize: 12,
                    }}
                  >
                    {children}
                  </code>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Tool invocations */}
        {message.toolInvocations?.map((inv) => (
          <div key={inv.toolCallId} style={{ marginBottom: 8 }}>
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
