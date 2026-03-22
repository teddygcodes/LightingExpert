'use client'

import { useState, useEffect } from 'react'
import { buildCatalogString, parseExistingCatalog } from '@/lib/configurator'
import type { OrderingMatrixData } from '@/lib/configurator'

interface Props {
  productId: string
  submittalItemId: string
  currentOverride?: string | null
  onCatalogBuilt: (catalogString: string, isComplete: boolean) => void
  onClose: () => void
}

export default function ProductConfigurator({ productId, currentOverride, onCatalogBuilt, onClose }: Props) {
  const [matrix, setMatrix] = useState<OrderingMatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [columnSelections, setColumnSelections] = useState<Record<string, string>>({})
  const [suffixSelections, setSuffixSelections] = useState<string[]>([])
  const [parseWarning, setParseWarning] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/products/${productId}/configurator`)
      .then(r => r.json())
      .then(data => {
        if (!data.hasMatrix) { onClose(); return }
        const m = data.matrix as OrderingMatrixData
        setMatrix(m)

        // Initialize defaults: isDefault option or first option per column
        const defaults: Record<string, string> = {}
        const sorted = [...m.columns].sort((a, b) => a.position - b.position)
        for (const col of sorted) {
          const def = col.options.find(o => o.isDefault) ?? col.options[0]
          if (def) defaults[String(col.position)] = def.code
        }

        // If currentOverride exists, try to parse it back into selections
        if (currentOverride) {
          const parsed = parseExistingCatalog(currentOverride, m)
          if (parsed.confidence >= 0.5) {
            // Merge parsed selections over defaults
            setColumnSelections({ ...defaults, ...parsed.columnSelections })
            setSuffixSelections(parsed.suffixSelections)
            if (parsed.unparsed.length > 0) {
              setParseWarning(`Some segments could not be matched: ${parsed.unparsed.join(', ')}`)
            }
          } else {
            // Low confidence parse — use defaults but warn user
            setColumnSelections(defaults)
            setParseWarning(`Could not parse "${currentOverride}" into this matrix (${Math.round(parsed.confidence * 100)}% match). Showing defaults — save to overwrite.`)
          }
        } else {
          setColumnSelections(defaults)
        }
      })
      .finally(() => setLoading(false))
  }, [productId, currentOverride])

  if (loading) {
    return (
      <div style={{ padding: '12px 16px', background: '#f9f9f9', border: '1px solid #e0e0e0', fontSize: 12, color: '#888' }}>
        Loading configurator…
      </div>
    )
  }

  if (!matrix) return null

  const result = buildCatalogString(matrix, columnSelections, suffixSelections)
  const sorted = [...matrix.columns].sort((a, b) => a.position - b.position)

  function toggleSuffix(code: string) {
    setSuffixSelections(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid #ccc',
    padding: '4px 6px',
    fontSize: 12,
    fontFamily: 'monospace',
    background: '#fff',
    cursor: 'pointer',
    minWidth: 80,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    color: '#6b6b6b',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 3,
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ background: '#f9f9f9', border: '1px solid #e0e0e0', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          Configure: {matrix.baseFamily}
          {matrix.sampleNumber && (
            <span style={{ fontSize: 11, fontWeight: 400, color: '#6b6b6b', marginLeft: 8 }}>
              Sample: {matrix.sampleNumber}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 16, lineHeight: 1, padding: '0 4px' }}
        >×</button>
      </div>

      {parseWarning && (
        <div style={{ fontSize: 11, color: '#c0392b', background: '#fdf2f2', border: '1px solid #f4c2c2', padding: '6px 10px', marginBottom: 10 }}>
          {parseWarning}
        </div>
      )}

      {/* Column dropdowns */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginBottom: 12 }}>
        {sorted.map(col => (
          <div key={col.position}>
            <label style={labelStyle}>
              {col.shortLabel}{col.required ? ' *' : ''}
            </label>
            {col.options.length === 1 ? (
              <div style={{ ...inputStyle, color: '#888', background: '#f0f0f0', padding: '4px 8px' }}>
                {col.options[0].code}
              </div>
            ) : (
              <select
                value={columnSelections[String(col.position)] ?? ''}
                onChange={e => setColumnSelections(prev => ({ ...prev, [String(col.position)]: e.target.value }))}
                style={{ ...inputStyle, border: '1px solid #ccc' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#0078d4')}
                onBlur={e => (e.currentTarget.style.borderColor = '#ccc')}
              >
                <option value="">— select —</option>
                {col.options.map(opt => (
                  <option key={opt.code} value={opt.code}>
                    {opt.code} — {opt.description}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      {/* Built catalog string */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: '#1a1a1a', borderRadius: 2 }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: result.catalogString ? '#fff' : '#888', letterSpacing: '0.05em', flex: 1 }}>
          {result.catalogString || '—'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', color: result.isComplete ? '#6fcf97' : '#eb5757' }}>
          {result.isComplete ? '✓ Complete' : `${result.missingColumns.length} missing`}
        </span>
      </div>

      {!result.isComplete && result.missingColumns.length > 0 && (
        <div style={{ fontSize: 11, color: '#c0392b', marginBottom: 8 }}>
          Missing: {result.missingColumns.join(', ')}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div style={{ fontSize: 11, color: '#e67e22', marginBottom: 8 }}>
          {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {/* Suffix checkboxes */}
      {matrix.suffixOptions && matrix.suffixOptions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Options (Add as Suffix)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {matrix.suffixOptions.map(suf => (
              <label key={suf.code} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={suffixSelections.includes(suf.code)}
                  onChange={() => toggleSuffix(suf.code)}
                  style={{ margin: 0 }}
                />
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#d13438' }}>{suf.code}</span>
                <span style={{ color: '#555' }}>— {suf.description}</span>
                {suf.notes && <span style={{ color: '#888', fontSize: 11 }}>({suf.notes})</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Save button */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onCatalogBuilt(result.catalogString, result.isComplete)}
          disabled={!result.catalogString}
          style={{
            background: result.catalogString ? '#d13438' : '#ccc',
            color: '#fff',
            border: 'none',
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: result.catalogString ? 'pointer' : 'not-allowed',
          }}
        >
          Save Configuration
        </button>
        <button
          onClick={onClose}
          style={{ background: 'none', border: '1px solid #ccc', padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: '#444' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
