'use client'

import { useState, memo } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message, ToolInvocation } from 'ai'
import ProductInlineCard from './ProductInlineCard'
import SpecSheetPreview from './SpecSheetPreview'

const AddToSubmittalDialog = dynamic(() => import('./AddToSubmittalDialog'), { ssr: false })
import type {
  SearchProductsToolResult,
  CrossReferenceToolResult,
  SpecSheetToolResult,
  AddToSubmittalToolResult,
  RecommendFixturesToolResult,
  RecommendationResult,
} from '@/lib/agent/types'

interface Props {
  message: Message
  onAddToSubmittal?: (catalogNumber: string) => void
  onSelectProduct?: (catalogNumber: string) => void
  isStreaming?: boolean
  suppressSpecSheet?: boolean
}

const PdfAnnotator = dynamic(() => import('./PdfAnnotator'), { ssr: false })

// ─── CrossReferenceResult — cross-ref cards with per-match Spec Sheet button ──

function CrossReferenceResult({
  result,
  onAddToSubmittal,
}: {
  result: CrossReferenceToolResult
  onAddToSubmittal?: (catalogNumber: string) => void
}) {
  const [activeSpec, setActiveSpec] = useState<{ pdfUrl: string; catalog: string } | null>(null)

  // Support old shape (matches) and new shape (exactMatches) for session cache compat
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exactMatches = result.exactMatches ?? (result as any).matches ?? []

  const sourceLine = (
    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8, display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span style={{ fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
        Source fixture
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>
        {result.source.catalogNumber}
      </span>
      <span style={{ color: 'var(--text-faint)' }}>
        {result.source.manufacturer}
        {result.source.lumens ? ` · ${result.source.lumens.toLocaleString()} lm` : ''}
        {result.source.wattage ? ` · ${result.source.wattage}W` : ''}
      </span>
    </div>
  )

  let content: React.ReactNode

  if (exactMatches.length > 0) {
    content = (
      <div style={{ marginTop: 6 }}>
        {sourceLine}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Exact cross-reference matches
        </div>
        {exactMatches.map((m: CrossReferenceToolResult['exactMatches'][number], i: number) => {
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
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.02em' }}>
                      {m.catalogNumber}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                      {m.manufacturerSlug}
                    </span>
                    {m.specSheetPath && (
                      <button
                        onClick={() => setActiveSpec({ pdfUrl: m.specSheetPath!, catalog: m.catalogNumber })}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          fontWeight: 500,
                          lineHeight: 1.4,
                        }}
                      >
                        Spec Sheet
                      </button>
                    )}
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
          {result.rejectCount} hard-rejected (incompatible specs)
        </div>
      </div>
    )
  } else if (result.fallbackUsed && result.fallbackAlternatives?.length > 0) {
    content = (
      <div style={{ marginTop: 6 }}>
        {sourceLine}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Closest alternatives (no exact cross-reference)
        </div>
        {result.fallbackAlternatives.map((p) => (
          <ProductInlineCard key={p.id} product={p} onAddToSubmittal={onAddToSubmittal} />
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
          {result.filterDescription}
        </div>
      </div>
    )
  } else {
    content = (
      <div style={{ marginTop: 6 }}>
        {sourceLine}
        <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
          {result.filterLevel === 'untyped'
            ? 'Fixture not classified — cross-reference unavailable.'
            : 'No cross-reference matches found.'}
        </div>
      </div>
    )
  }

  const modal = activeSpec
    ? createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}
          onClick={(e) => { if (e.target === e.currentTarget) setActiveSpec(null) }}
        >
          <div style={{ position: 'relative', flex: 1, margin: '32px', background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {activeSpec.catalog}
              </span>
              <button
                onClick={() => setActiveSpec(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <PdfAnnotator pdfUrl={activeSpec.pdfUrl} />
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <>
      {content}
      {modal}
    </>
  )
}

// ─── Disambiguation list with inline spec-sheet modal ─────────────────────────

function DisambigList({
  products,
  onSelectProduct,
  onAddToSubmittal,
}: {
  products: SearchProductsToolResult['products']
  onSelectProduct?: (catalogNumber: string) => void
  onAddToSubmittal?: (catalogNumber: string) => void
}) {
  const [activeSpec, setActiveSpec] = useState<{ pdfUrl: string; catalog: string } | null>(null)
  const [dialogProduct, setDialogProduct] = useState<SearchProductsToolResult['products'][number] | null>(null)
  const [addedMsg, setAddedMsg] = useState<string | null>(null)

  const modal = activeSpec
    ? createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}
          onClick={(e) => { if (e.target === e.currentTarget) setActiveSpec(null) }}
        >
          <div style={{ position: 'relative', flex: 1, margin: '32px', background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {activeSpec.catalog}
              </span>
              <button
                onClick={() => setActiveSpec(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}
              >×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <PdfAnnotator pdfUrl={activeSpec.pdfUrl} />
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <>
      <div style={{ marginTop: 6, border: '1px solid var(--border)' }}>
        {products.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderBottom: i < products.length - 1 ? '1px solid var(--border)' : 'none',
              background: 'var(--surface)',
            }}
          >
            {/* Catalog + specs — clickable area */}
            <div
              onClick={() => onSelectProduct?.(p.catalogNumber)}
              style={{ flex: 1, minWidth: 0, cursor: onSelectProduct ? 'pointer' : 'default' }}
              onMouseEnter={(e) => { if (onSelectProduct) (e.currentTarget as HTMLDivElement).style.opacity = '0.75' }}
              onMouseLeave={(e) => { if (onSelectProduct) (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                {p.catalogNumber}
              </span>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.displayName ?? p.familyName ?? ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 3 }}>
                {(p.lumensMin != null && p.lumensMax != null)
                  ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.lumensMin.toLocaleString()}–{p.lumensMax.toLocaleString()} lm</span>
                  : p.lumens != null
                  ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.lumens.toLocaleString()} lm</span>
                  : null}
                {(p.wattageMin != null && p.wattageMax != null)
                  ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.wattageMin}–{p.wattageMax}W</span>
                  : p.wattage != null && p.wattage > 0
                  ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.wattage}W</span>
                  : null}
                {p.cri != null && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CRI {p.cri}</span>}
                {p.cctOptions?.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.cctOptions.map(c => `${c}K`).join('/')}</span>
                )}
                {p.voltage && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.voltage.replace(/^V/, '').replace(/_/g, '/')}V</span>}
              </div>
            </div>

            {/* Right-side: badges + actions */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {p.dlcPremium && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#15803d', background: '#f0fdf4', padding: '2px 6px', border: '1px solid #bbf7d0' }}>DLC PREMIUM</span>
                )}
                {p.dlcListed && !p.dlcPremium && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#15803d', background: '#f0fdf4', padding: '2px 6px', border: '1px solid #bbf7d0' }}>DLC</span>
                )}
                {p.wetLocation && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#3730a3', background: '#eef2ff', padding: '2px 6px', border: '1px solid #c7d2fe' }}>WET LOC</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {p.specSheetPath && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveSpec({ pdfUrl: p.specSheetPath!, catalog: p.catalogNumber }) }}
                    style={{
                      fontSize: 11, padding: '3px 9px',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500,
                    }}
                  >
                    Spec Sheet
                  </button>
                )}
                {onAddToSubmittal && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDialogProduct(p) }}
                    style={{
                      fontSize: 11, padding: '3px 9px',
                      background: 'var(--accent)', border: 'none',
                      cursor: 'pointer', color: '#fff', fontWeight: 500,
                    }}
                  >
                    + Submittal
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {modal}
      {addedMsg && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          margin: '6px 0 0', fontSize: 12,
          color: '#15803d', background: '#f0fdf4',
          border: '1px solid #bbf7d0', borderLeft: '3px solid #15803d',
          padding: '5px 12px',
        }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1.5 5.5l2.5 2.5L9.5 2" stroke="#15803d" strokeWidth="1.8" strokeLinecap="square"/>
          </svg>
          {addedMsg}
        </div>
      )}
      {dialogProduct && (
        <AddToSubmittalDialog
          product={dialogProduct}
          onClose={() => setDialogProduct(null)}
          onAdded={(name) => {
            setDialogProduct(null)
            setAddedMsg(`Added to ${name}`)
            setTimeout(() => setAddedMsg(null), 4000)
          }}
        />
      )}
    </>
  )
}

// ─── Tool loading indicator ────────────────────────────────────────────────────

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

function sanitizeContent(content: string, toolInvocations?: ToolInvocation[]): string {
  if (!content || !toolInvocations?.length) return content
  const hasProductCards = toolInvocations.some(
    (inv) =>
      inv.state === 'result' &&
      (
        (inv.toolName === 'search_products' &&
          ((inv as ToolInvocation & { state: 'result'; result: unknown }).result as SearchProductsToolResult)?.total > 0) ||
        (inv.toolName === 'cross_reference' &&
          !((inv as ToolInvocation & { state: 'result'; result: unknown }).result as Record<string, unknown>)?.error) ||
        (inv.toolName === 'recommend_fixtures' &&
          ((inv as ToolInvocation & { state: 'result'; result: unknown }).result as RecommendFixturesToolResult)?.recommendations?.length > 0)
      )
  )
  const hasSpecSheetResult = toolInvocations.some(
    (inv) =>
      inv.toolName === 'get_spec_sheet' &&
      inv.state === 'result' &&
      !((inv as ToolInvocation & { state: 'result'; result: unknown }).result as Record<string, unknown>)?.error
  )
  if (!hasProductCards && !hasSpecSheetResult) return content
  const lines = content.split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (hasProductCards) {
      if (/^\s*\|/.test(line)) continue
      if (/^[ \t]*[-*][ \t]+\*\*[A-Z][A-Z0-9][A-Z0-9\-_./ ]{0,28}\*\*/.test(line)) continue
      if (/^[ \t]*\d+\.[ \t]+\*\*[A-Z][A-Z0-9][A-Z0-9\-_./ ]{0,28}\*\*/.test(line)) continue
    }
    // Strip markdown links when spec sheet is already rendered inline
    if (hasSpecSheetResult && /\[.+\]\(.+\)/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function ToolResultRenderer({
  invocation,
  onAddToSubmittal,
  onSelectProduct,
  allInvocations,
  messageContent,
  isStreaming,
  suppressSpecSheet,
}: {
  invocation: ToolInvocation & { state: 'result' }
  onAddToSubmittal?: (catalogNumber: string) => void
  onSelectProduct?: (catalogNumber: string) => void
  allInvocations: ToolInvocation[]
  messageContent: string
  isStreaming?: boolean
  suppressSpecSheet?: boolean
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
    // Suppress search cards when they were just an intermediate lookup before
    // cross-referencing or recommending — the final result is the relevant output.
    const hasSuccessfulCrossRef = allInvocations.some(
      (other) =>
        other.toolName === 'cross_reference' &&
        other.state === 'result' &&
        !((other as ToolInvocation & { state: 'result'; result: unknown }).result as Record<string, unknown>)?.error
    )
    const hasRecommendResult = allInvocations.some(
      (other) =>
        other.toolName === 'recommend_fixtures' &&
        other.state === 'result' &&
        ((other as ToolInvocation & { state: 'result'; result: unknown }).result as RecommendFixturesToolResult)?.recommendations?.length > 0
    )
    if (hasSuccessfulCrossRef || hasRecommendResult) return null

    const r = result as SearchProductsToolResult
    if (!r.products?.length) {
      // Suppress ghost empty-result card if another search in this message succeeded
      const hasSuccessfulSibling = allInvocations.some(
        (other) =>
          other.toolCallId !== invocation.toolCallId &&
          other.toolName === 'search_products' &&
          other.state === 'result' &&
          ((other as ToolInvocation & { state: 'result'; result: unknown }).result as SearchProductsToolResult)?.total > 0
      )
      if (hasSuccessfulSibling) return null
      return <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>No products found matching those criteria.</div>
    }
    // During streaming, messageContent is incomplete — default small result sets to compact
    // disambiguation view to avoid flashing from full cards to compact table mid-stream.
    const disambigText = /which|pick\s+one|select\s+one/i.test(messageContent)
    const isThisDisambig = r.total >= 2 && r.total <= 8 && (isStreaming || disambigText)

    // If any sibling search_products in this message is a disambiguation block,
    // suppress this one (it was a broad exploratory search, not the final result).
    const anyOtherDisambig = allInvocations.some((other) => {
      if (other.toolCallId === invocation.toolCallId) return false
      if (other.toolName !== 'search_products' || other.state !== 'result') return false
      const o = (other as ToolInvocation & { state: 'result'; result: unknown }).result as SearchProductsToolResult
      return o?.total >= 2 && o?.total <= 8 && (isStreaming || disambigText)
    })
    if (anyOtherDisambig && !isThisDisambig) return null

    if (isThisDisambig) {
      return (
        <DisambigList
          products={r.products}
          onSelectProduct={onSelectProduct}
          onAddToSubmittal={onAddToSubmittal}
        />
      )
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
    return (
      <CrossReferenceResult
        result={result as CrossReferenceToolResult}
        onAddToSubmittal={onAddToSubmittal}
      />
    )
  }

  if (toolName === 'get_spec_sheet') {
    // Suppress when a search result was already shown in this exchange.
    // The flag is computed in ChatInterface across all messages in the conversation.
    if (suppressSpecSheet) return null

    const r = result as SpecSheetToolResult
    const manufacturerSlug = r.manufacturer.toLowerCase().replace(/\s+/g, '-')
    const thumbnailUrl = `/thumbnails/${manufacturerSlug}/${encodeURIComponent(r.catalogNumber)}.png`
    return (
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        marginTop: 6,
        overflow: 'hidden',
        fontSize: 13,
      }}>
        {/* Product header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          <div style={{
            width: 72,
            height: 72,
            flexShrink: 0,
            background: 'var(--bg)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <img
              src={thumbnailUrl}
              alt={r.catalogNumber}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.02em', color: 'var(--text)' }}>
                {r.catalogNumber}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {r.manufacturer}
              </span>
            </div>
            {r.displayName && (
              <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.displayName}
              </div>
            )}
            {r.matchType === 'family_spec_sheet_match' && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', marginTop: 4 }}>
                Family spec sheet — exact configuration selected via ordering code
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              {onAddToSubmittal && (
                <button
                  onClick={() => onAddToSubmittal(r.catalogNumber)}
                  style={{
                    fontSize: 12,
                    padding: '4px 11px',
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  + Submittal
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Spec sheet inline */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <SpecSheetPreview
            catalogNumber={r.catalogNumber}
            displayName={r.displayName}
            specSheetPath={r.specSheetPath}
            specSheets={r.specSheets}
            productPageUrl={r.productPageUrl}
          />
        </div>
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
          Added <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.catalogNumber}</strong>{' '}
          Type <strong>{r.fixtureType}</strong> ×{r.quantity} →{' '}
          <a href={`/submittals/${r.submittalId}`} style={{ color: 'var(--accent)', fontWeight: 500 }}>
            {r.submittalName}
          </a>
          {r.wasNewSubmittal && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> (new)</span>}
        </span>
      </div>
    )
  }

  if (toolName === 'recommend_fixtures') {
    const r = result as RecommendFixturesToolResult
    if (!r.recommendations?.length) {
      return <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>No recommendations found.</div>
    }

    const rankColors: Record<string, string> = {
      'Top pick': 'var(--accent)',
      'Strong alternative': '#15803d',
      'Also consider': 'var(--text-muted)',
      'Consider': 'var(--text-muted)',
      'Alternative': 'var(--text-faint)',
    }

    return (
      <div style={{ marginTop: 6 }}>
        {r.recommendations.map((rec, i) => {
          const rankColor = rankColors[rec.rankLabel] ?? 'var(--text-muted)'
          const lowConfidence = rec.fitConfidence < 0.6
          return (
            <div key={rec.id} style={{ marginBottom: i < r.recommendations.length - 1 ? 12 : 4 }}>
              {/* Rank header */}
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                padding: '4px 0 6px',
                flexWrap: 'wrap',
              }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: rankColor,
                  flexShrink: 0,
                }}>
                  ▶ {rec.rankLabel}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
                  {rec.whyRecommended}
                  {lowConfidence && (
                    <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}> (limited spec data)</span>
                  )}
                </span>
              </div>
              {/* Product card */}
              <ProductInlineCard
                product={rec}
                onAddToSubmittal={onAddToSubmittal}
              />
              {/* Tradeoffs */}
              {rec.tradeoffs && (
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  fontStyle: 'italic',
                  padding: '4px 2px 0',
                }}>
                  {rec.tradeoffs}
                </div>
              )}
            </div>
          )
        })}
        {/* Footer */}
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span>Ranked for {r.context.applicationType}</span>
          <span>·</span>
          <span>{r.context.projectPosture.replace(/_/g, ' ')}</span>
          <span>·</span>
          <span>{r.evaluatedCount} candidates evaluated</span>
        </div>
      </div>
    )
  }

  return null
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ margin: '0 0 8px', color: 'var(--text)', lineHeight: 1.65 }}>{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ marginBottom: 3, color: 'var(--text-secondary)' }}>{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ fontWeight: 600, color: 'var(--text)' }}>{children}</strong>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '1px 5px', fontSize: 12 }}>
      {children}
    </code>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 4px', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</h3>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', verticalAlign: 'top' }}>{children}</td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr style={{ transition: 'background 0.1s' }}>{children}</tr>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
}

function ChatMessage({ message, onAddToSubmittal, onSelectProduct, isStreaming, suppressSpecSheet }: Props) {
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
        {/* During streaming: show dots (hides pre-tool planning text — we can't know yet if tools are coming).
            After streaming: show content only for tool-free messages (tool messages' content is pre-tool text).
            Content fades in with msg-animate when streaming completes. */}
        {isStreaming && !message.toolInvocations?.length && (
          <div style={{ display: 'flex', gap: 4, padding: '2px 0 4px' }}>
            <span className="dot-1" style={{ width: 5, height: 5, background: 'var(--accent)', display: 'inline-block' }} />
            <span className="dot-2" style={{ width: 5, height: 5, background: 'var(--accent)', display: 'inline-block' }} />
            <span className="dot-3" style={{ width: 5, height: 5, background: 'var(--accent)', display: 'inline-block' }} />
          </div>
        )}
        {!isStreaming && !message.toolInvocations?.length && message.content && (
          <div className="msg-animate">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {sanitizeContent(message.content, message.toolInvocations)}
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
                onSelectProduct={onSelectProduct}
                allInvocations={message.toolInvocations ?? []}
                messageContent={message.content ?? ''}
                isStreaming={isStreaming}
                suppressSpecSheet={suppressSpecSheet}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(ChatMessage)
