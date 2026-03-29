'use client'

import { useState, useEffect } from 'react'
import { buildCatalogString, parseExistingCatalog } from '@/lib/configurator'
import type { OrderingMatrixData, SkuTableEntry } from '@/lib/configurator'

// =============================================================================
// Module-level sub-components (hoisted out of ProductConfigurator to prevent
// unmount/remount on every render)
// =============================================================================

interface SpecPillProps {
  label: string
  value: string
}
function SpecPill({ label, value }: SpecPillProps) {
  return (
    <span style={{
      background: '#f0f0f0',
      fontSize: 11,
      borderRadius: 3,
      padding: '2px 6px',
      color: '#444',
      whiteSpace: 'nowrap',
    }}>
      {label}: {value}
    </span>
  )
}

interface SkuCardProps {
  entry: SkuTableEntry
  isSelected: boolean
  onSelect: (partNumber: string) => void
}
function SkuCard({ entry, isSelected, onSelect }: SkuCardProps) {
  return (
    <div
      onClick={() => onSelect(entry.stockPartNumber)}
      style={{
        position: 'relative',
        border: isSelected ? '2px solid #1a1a1a' : '1px solid #d0d0d0',
        borderRadius: 6,
        padding: '8px 10px',
        background: isSelected ? '#e8f4fd' : '#fff',
        cursor: 'pointer',
        transition: 'border-color 0.1s, background 0.1s',
      }}
    >
      {entry.isCommon && (
        <span style={{
          position: 'absolute',
          top: 6,
          right: 8,
          background: '#2563eb',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          borderRadius: 10,
          padding: '1px 7px',
          letterSpacing: '0.03em',
        }}>
          Popular
        </span>
      )}
      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#000', marginBottom: 5, paddingRight: entry.isCommon ? 60 : 0 }}>
        {entry.stockPartNumber}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {entry.lumens && <SpecPill label="Lumens" value={entry.lumens} />}
        {entry.watts && <SpecPill label="Watts" value={entry.watts} />}
        {entry.cct && <SpecPill label="CCT" value={entry.cct} />}
        {entry.voltage && <SpecPill label="Voltage" value={entry.voltage} />}
        {entry.housing && <SpecPill label="Housing" value={entry.housing} />}
      </div>
    </div>
  )
}

interface SkuCardListProps {
  entries: SkuTableEntry[]
  selectedSku: string | null
  onSelect: (partNumber: string) => void
}
function SkuCardList({ entries, selectedSku, onSelect }: SkuCardListProps) {
  if (entries.length === 0) {
    return <div style={{ color: '#666', padding: '12px 0', fontSize: 13 }}>No configurations available.</div>
  }
  return (
    <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
      {entries.map(entry => (
        <SkuCard
          key={entry.stockPartNumber}
          entry={entry}
          isSelected={selectedSku === entry.stockPartNumber}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

interface ColumnBuilderProps {
  sorted: OrderingMatrixData['columns']
  columnSelections: Record<string, string>
  onColumnChange: (position: string, value: string) => void
  result: ReturnType<typeof buildCatalogString>
  matrix: OrderingMatrixData
  suffixSelections: string[]
  onToggleSuffix: (code: string) => void
  inputStyle: React.CSSProperties
  labelStyle: React.CSSProperties
}
function ColumnBuilder({
  sorted,
  columnSelections,
  onColumnChange,
  result,
  matrix,
  suffixSelections,
  onToggleSuffix,
  inputStyle,
  labelStyle,
}: ColumnBuilderProps) {
  return (
    <>
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
                onChange={e => onColumnChange(String(col.position), e.target.value)}
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
                  onChange={() => onToggleSuffix(suf.code)}
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
    </>
  )
}

// =============================================================================
// Main component
// =============================================================================

interface Props {
  productId: string
  submittalItemId?: string
  currentOverride?: string | null
  onCatalogBuilt: (catalogString: string, isComplete: boolean) => void
  onClose: () => void
  onNotFound?: () => void
}

export default function ProductConfigurator({ productId, currentOverride, onCatalogBuilt, onClose, onNotFound }: Props) {
  const [matrix, setMatrix] = useState<OrderingMatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [columnSelections, setColumnSelections] = useState<Record<string, string>>({})
  const [suffixSelections, setSuffixSelections] = useState<string[]>([])
  const [parseWarning, setParseWarning] = useState<string | null>(null)

  // New state for sku_table / hybrid branches
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [hybridMode, setHybridMode] = useState<'sku' | 'custom'>('sku')
  const [customBuilderOpen, setCustomBuilderOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/products/${productId}/configurator`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (!data.hasMatrix) { setLoading(false); if (onNotFound) onNotFound(); else onClose(); return }
        const m = data.matrix as OrderingMatrixData
        setMatrix(m)

        // Initialize column defaults: isDefault option or first option per column
        const defaults: Record<string, string> = {}
        const sorted = [...m.columns].sort((a, b) => a.position - b.position)
        for (const col of sorted) {
          const def = col.options.find(o => o.isDefault) ?? col.options[0]
          if (def) defaults[String(col.position)] = def.code
        }

        // Three-step override parsing hierarchy
        if (currentOverride) {
          // Step 1: Exact SKU match
          const exactSkuEntry = (m.skuEntries ?? []).find(
            entry => entry.stockPartNumber === currentOverride
          )
          if (exactSkuEntry) {
            setSelectedSku(currentOverride)
            setHybridMode('sku')
            setColumnSelections(defaults)
          } else if (m.matrixType !== 'sku_table') {
            // Step 2: Column parse (skip for sku_table — no columns to parse against)
            const parsed = parseExistingCatalog(currentOverride, m)
            if (parsed.confidence >= 0.5) {
              setColumnSelections({ ...defaults, ...parsed.columnSelections })
              setSuffixSelections(parsed.suffixSelections)
              if (m.matrixType === 'hybrid') {
                setHybridMode('custom')
                setCustomBuilderOpen(true)
              }
              if (parsed.unparsed.length > 0) {
                setParseWarning(`Some segments could not be matched: ${parsed.unparsed.join(', ')}`)
              }
            } else {
              // Step 3: No match — use defaults, warn if there was a currentOverride
              setColumnSelections(defaults)
              setParseWarning(`Could not parse "${currentOverride}" into this matrix (${Math.round(parsed.confidence * 100)}% match). Showing defaults — save to overwrite.`)
            }
          } else {
            // Step 3 directly for sku_table: override wasn't in the SKU list — show default state, no warning
            setColumnSelections(defaults)
          }
        } else {
          setColumnSelections(defaults)
        }

        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        onClose()
      })
  }, [productId, currentOverride])

  if (loading) {
    return (
      <div style={{ padding: '12px 16px', background: '#f9f9f9', border: '1px solid #e0e0e0', fontSize: 12, color: '#888' }}>
        Analyzing spec sheet… this may take up to 30 seconds
      </div>
    )
  }

  if (!matrix) return null

  const result = buildCatalogString(matrix, columnSelections, suffixSelections)
  const sorted = [...matrix.columns].sort((a, b) => a.position - b.position)
  const sortedSkuEntries = [...(matrix.skuEntries ?? [])].sort((a, b) => a.position - b.position)

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

  // --- Shared header ---
  const header = (
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
  )

  const warningBanner = parseWarning && (
    <div style={{ fontSize: 11, color: '#c0392b', background: '#fdf2f2', border: '1px solid #f4c2c2', padding: '6px 10px', marginBottom: 10 }}>
      {parseWarning}
    </div>
  )

  // =========================================================================
  // Branch: sku_table
  // =========================================================================
  if (matrix.matrixType === 'sku_table') {
    return (
      <div style={{ background: '#f9f9f9', border: '1px solid #e0e0e0', padding: '14px 16px' }}>
        {header}
        {warningBanner}

        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Select a pre-built configuration
        </div>

        <SkuCardList
          entries={sortedSkuEntries}
          selectedSku={selectedSku}
          onSelect={sku => setSelectedSku(sku)}
        />

        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: '#1a1a1a', borderRadius: 6, fontSize: 13 }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: selectedSku ? '#fff' : '#888', letterSpacing: '0.05em', flex: 1 }}>
              {selectedSku || '—'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => selectedSku && onCatalogBuilt(selectedSku, true)}
            disabled={!selectedSku}
            style={{
              background: selectedSku ? '#c0392b' : '#ccc',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 4,
              fontWeight: 600,
              cursor: selectedSku ? 'pointer' : 'not-allowed',
              opacity: selectedSku ? 1 : 0.5,
            }}
          >
            Save Selection
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #ccc', padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: '#444', borderRadius: 4 }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // =========================================================================
  // Branch: hybrid
  // =========================================================================
  if (matrix.matrixType === 'hybrid') {
    const previewValue = hybridMode === 'sku' ? (selectedSku ?? '') : (result.catalogString ?? '')

    return (
      <div style={{ background: '#f9f9f9', border: '1px solid #e0e0e0', padding: '14px 16px' }}>
        {header}
        {warningBanner}

        {/* Section 1: Quick picks */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Common configurations
        </div>
        <SkuCardList
          entries={sortedSkuEntries}
          selectedSku={selectedSku}
          onSelect={sku => {
            setSelectedSku(sku)
            setHybridMode('sku')
          }}
        />

        {/* Separator */}
        <div style={{ borderTop: '1px solid #d0d0d0', margin: '14px 0' }} />

        {/* Section 2: Custom builder toggle */}
        <button
          onClick={() => {
            const willOpen = !customBuilderOpen
            setCustomBuilderOpen(willOpen)
            if (willOpen) {
              setHybridMode('custom')
            } else {
              setHybridMode('sku')
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            color: '#333',
            padding: '0 0 8px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{customBuilderOpen ? '▾' : '▸'}</span>
          Build custom configuration
        </button>

        {customBuilderOpen && (
          <div style={{ marginBottom: 8 }}>
            <ColumnBuilder
              sorted={sorted}
              columnSelections={columnSelections}
              onColumnChange={(position, value) => setColumnSelections(prev => ({ ...prev, [position]: value }))}
              result={result}
              matrix={matrix}
              suffixSelections={suffixSelections}
              onToggleSuffix={toggleSuffix}
              inputStyle={inputStyle}
              labelStyle={labelStyle}
            />
          </div>
        )}

        {/* Preview */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: '#1a1a1a', borderRadius: 6, fontSize: 13 }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: previewValue ? '#fff' : '#888', letterSpacing: '0.05em', flex: 1 }}>
            {previewValue || '—'}
          </span>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {hybridMode === 'sku' ? (
            <button
              onClick={() => selectedSku && onCatalogBuilt(selectedSku, true)}
              disabled={!selectedSku}
              style={{
                background: selectedSku ? '#c0392b' : '#ccc',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 4,
                fontWeight: 600,
                cursor: selectedSku ? 'pointer' : 'not-allowed',
                opacity: selectedSku ? 1 : 0.5,
              }}
            >
              Save Selection
            </button>
          ) : (
            <button
              onClick={() => onCatalogBuilt(result.catalogString, result.isComplete)}
              disabled={!result.catalogString}
              style={{
                background: result.catalogString ? '#c0392b' : '#ccc',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 4,
                fontWeight: 600,
                cursor: result.catalogString ? 'pointer' : 'not-allowed',
                opacity: result.catalogString ? 1 : 0.5,
              }}
            >
              Save Configuration
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #ccc', padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: '#444', borderRadius: 4 }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // =========================================================================
  // Branch: configurable (default — unchanged)
  // =========================================================================
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
