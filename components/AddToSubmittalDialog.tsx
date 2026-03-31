'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import type { ProductSearchResult } from '@/lib/agent/types'

const ProductConfigurator = dynamic(() => import('./ProductConfigurator'), { ssr: false })

interface SubmittalSummary {
  id: string
  projectName: string
  status: string
  items: Array<{ fixtureType: string | null }>
}

interface Props {
  product: ProductSearchResult
  onClose: () => void
  onAdded: (submittalName: string) => void
}

export default function AddToSubmittalDialog({ product, onClose, onAdded }: Props) {
  const [submittals, setSubmittals] = useState<SubmittalSummary[]>([])
  const [loadingSubmittals, setLoadingSubmittals] = useState(true)
  const [target, setTarget] = useState<string>('new')
  const [newProjectName, setNewProjectName] = useState('')
  const [fixtureType, setFixtureType] = useState('')
  const [catalogOverride, setCatalogOverride] = useState<string | null>(product.catalogNumber)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matrixNotFound, setMatrixNotFound] = useState(false)

  // Load all existing submittals (DRAFT and generated)
  useEffect(() => {
    fetch('/api/submittals')
      .then(r => r.json())
      .then((data: SubmittalSummary[]) => {
        setSubmittals(data)
        if (data.length > 0) setTarget(data[0].id)
      })
      .catch(() => {/* leave empty, 'new' is default */})
      .finally(() => setLoadingSubmittals(false))
  }, [])

  // Letters in use on the currently-selected submittal
  const selectedSubmittal = submittals.find(s => s.id === target)
  const lettersInUse = selectedSubmittal
    ? [...new Set(selectedSubmittal.items.map(i => i.fixtureType).filter(Boolean))] as string[]
    : []

  const canSubmit = !submitting && !(target === 'new' && !newProjectName.trim())

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      let submittalId = target
      if (target === 'new') {
        const res = await fetch('/api/submittals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: newProjectName.trim() }),
        })
        if (!res.ok) throw new Error('Failed to create submittal')
        const s = await res.json()
        submittalId = s.id
      }
      // Only set override if it differs from the base catalog number
      const override =
        catalogOverride && catalogOverride !== product.catalogNumber
          ? catalogOverride
          : null
      const res = await fetch(`/api/submittals/${submittalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_item',
          productId: product.id,
          fixtureType: fixtureType.trim() || undefined,
          quantity: 1,
          catalogNumberOverride: override,
        }),
      })
      if (!res.ok) throw new Error('Failed to add item')
      const submittalName =
        target === 'new'
          ? newProjectName.trim()
          : (submittals.find(s => s.id === submittalId)?.projectName ?? 'submittal')
      onAdded(submittalName)
    } catch {
      setError('Failed to add to submittal. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-muted)',
    marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    boxSizing: 'border-box',
  }

  const divider = <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

  const modal = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          width: 460,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Add to Submittal</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{product.catalogNumber}</span>
              {product.displayName && (
                <span style={{ marginLeft: 6 }}>— {product.displayName}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 16px 0' }}>

          {/* Section 1 — Configuration */}
          <div style={sectionLabel}>Part Number Configuration</div>
          {!matrixNotFound && catalogOverride !== product.catalogNumber ? (
            /* ── Confirmed selection banner ── */
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)', letterSpacing: '0.02em' }}>
                  {catalogOverride}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  ✓ Configuration selected
                </div>
              </div>
              <button
                onClick={() => setCatalogOverride(product.catalogNumber)}
                style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', textDecoration: 'underline' }}
              >
                Change
              </button>
            </div>
          ) : !matrixNotFound ? (
            /* ── Configurator (no selection yet) ── */
            <ProductConfigurator
              productId={product.id}
              currentOverride={product.catalogNumber}
              onCatalogBuilt={(cat) => setCatalogOverride(cat)}
              onClose={() => setCatalogOverride(product.catalogNumber)}
              onNotFound={() => setMatrixNotFound(true)}
            />
          ) : (
            /* ── No matrix fallback ── */
            <>
              <input
                type="text"
                value={catalogOverride ?? ''}
                onChange={e => setCatalogOverride(e.target.value || null)}
                style={inputStyle}
                placeholder="Catalog # override (optional)"
              />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Will add:{' '}
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {catalogOverride || product.catalogNumber}
                </span>
                {!catalogOverride && ' (base)'}
              </div>
            </>
          )}

          {divider}

          {/* Section 2 — Fixture Type */}
          <div style={sectionLabel}>Fixture Type Designation</div>
          <input
            type="text"
            value={fixtureType}
            onChange={e => setFixtureType(e.target.value.slice(0, 10).toUpperCase())}
            placeholder="e.g. A, B, HP-1"
            style={inputStyle}
          />
          {lettersInUse.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              In use on this submittal:{' '}
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {lettersInUse.join(', ')}
              </span>
            </div>
          )}

          {divider}

          {/* Section 3 — Submittal Picker */}
          <div style={sectionLabel}>Submittal</div>
          {loadingSubmittals ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0' }}>
              Loading submittals…
            </div>
          ) : (
            <>
              <select
                value={target}
                onChange={e => setTarget(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {submittals.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.projectName} ({s.items.length} fixture{s.items.length !== 1 ? 's' : ''})
                    {s.status !== 'DRAFT' ? ` • ${s.status}` : ''}
                  </option>
                ))}
                <option value="new">+ Create new submittal…</option>
              </select>
              {target === 'new' && (
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="Project name (required)"
                  style={{ ...inputStyle, marginTop: 8 }}
                  autoFocus
                />
              )}
            </>
          )}

          {error && (
            <div style={{ fontSize: 12, color: '#c0392b', marginTop: 10 }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          padding: '16px',
          borderTop: '1px solid var(--border)',
          marginTop: 16,
        }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 13,
              padding: '7px 14px',
              background: 'transparent',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              fontSize: 13,
              padding: '7px 18px',
              background: canSubmit ? 'var(--accent)' : 'var(--border)',
              color: canSubmit ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            {submitting ? 'Adding…' : 'Add to Submittal'}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
