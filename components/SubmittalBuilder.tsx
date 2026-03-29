'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import ProductConfigurator from './ProductConfigurator'

interface Props {
  submittalId: string
  initialData: {
    projectName: string
    projectNumber: string | null
    preparedBy: string | null
    preparedFor: string | null
    revision: string | null
    notes: string | null
  }
  onRefresh: () => void
}

interface ProductOption {
  id: string
  catalogNumber: string
  displayName: string | null
  specSheetPath: string | null
  configOptions: Record<string, string[]> | null
  orderingMatrixId: string | null
  manufacturer: { name: string } | null
}

export default function SubmittalBuilder({ submittalId, initialData, onRefresh }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [data, setData] = useState(initialData)
  const [showProjectInfo, setShowProjectInfo] = useState(false)

  // Schedule import
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: string[]; unmatched: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fixture add form
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const [searchResults, setSearchResults] = useState<ProductOption[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [fixtureType, setFixtureType] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [locationTag, setLocationTag] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [configSelections, setConfigSelections] = useState<Record<string, string>>({})
  const [showConfigurator, setShowConfigurator] = useState(false)
  const [catalogOverride, setCatalogOverride] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  // Reset config selections and catalog override whenever a new product is selected
  useEffect(() => {
    setCatalogOverride(null)
    if (!selectedProduct) { setConfigSelections({}); setShowConfigurator(false); return }
    setShowConfigurator(true)
    if (!selectedProduct.configOptions) { setConfigSelections({}); return }
    setConfigSelections(
      Object.fromEntries(Object.entries(selectedProduct.configOptions).map(([k, opts]) => [k, opts[0] ?? '']))
    )
  }, [selectedProduct])

  async function saveProjectInfo() {
    setSaving(true)
    await fetch(`/api/submittals/${submittalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/submittals/${submittalId}/import-schedule`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { setImportError(json.error ?? 'Import failed'); return }
      setImportResult(json)
      if (json.imported?.length) onRefresh()
    } catch {
      setImportError('Network error — please try again')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const searchProducts = useCallback(async (q: string) => {
    setSearchError(false)
    if (q.length < 2) { setSearchResults([]); return }
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`)
      if (!res.ok) { setSearchError(true); return }
      const json = await res.json()
      setSearchResults(json.data ?? [])
    } catch {
      setSearchError(true)
    }
  }, [])

  // Auto-search when debounced query changes
  useEffect(() => {
    if (!selectedProduct) searchProducts(debouncedSearchQuery)
  }, [debouncedSearchQuery, selectedProduct, searchProducts])

  async function addFixture() {
    if (!selectedProduct || !fixtureType) return
    setAdding(true)
    setAddError(null)

    let resolvedOverride: string | undefined
    if (catalogOverride) {
      resolvedOverride = catalogOverride
    } else if (selectedProduct.configOptions && Object.keys(configSelections).length > 0) {
      resolvedOverride = selectedProduct.catalogNumber + '-' + Object.values(configSelections).join('-')
    }

    try {
      const res = await fetch(`/api/submittals/${submittalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_item',
          productId: selectedProduct.id,
          fixtureType: fixtureType.toUpperCase(),
          quantity,
          locationTag: locationTag || null,
          catalogNumberOverride: resolvedOverride,
          notes: notes || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setAddError((json as { error?: string }).error ?? 'Failed to add fixture')
        return
      }
      setSelectedProduct(null)
      setSearchQuery('')
      setSearchResults([])
      setFixtureType('')
      setQuantity(1)
      setLocationTag('')
      setNotes('')
      setConfigSelections({})
      setCatalogOverride(null)
      onRefresh()
    } catch {
      setAddError('Network error — please try again')
    } finally {
      setAdding(false)
    }
  }

  const inputStyle = {
    border: '1px solid #ccc',
    padding: '6px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6b6b6b', marginBottom: 4, display: 'block' }

  return (
    <div>
      {/* Project Info — collapsible */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', marginBottom: 20 }}>
        <button
          onClick={() => setShowProjectInfo(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '12px 16px', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 13, fontWeight: 700, textAlign: 'left',
          }}
        >
          <span>Edit Project Info</span>
          <span style={{ fontSize: 11, color: '#6b6b6b' }}>{showProjectInfo ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showProjectInfo && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>PROJECT NAME *</label>
                <input style={inputStyle} value={data.projectName} onChange={e => setData({ ...data, projectName: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>PROJECT NUMBER</label>
                <input style={inputStyle} value={data.projectNumber ?? ''} onChange={e => setData({ ...data, projectNumber: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>PREPARED BY</label>
                <input style={inputStyle} value={data.preparedBy ?? ''} onChange={e => setData({ ...data, preparedBy: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>PREPARED FOR</label>
                <input style={inputStyle} value={data.preparedFor ?? ''} onChange={e => setData({ ...data, preparedFor: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>REVISION</label>
                <input style={inputStyle} value={data.revision ?? ''} onChange={e => setData({ ...data, revision: e.target.value })} placeholder="Rev 0" />
              </div>
              <div>
                <label style={labelStyle}>NOTES</label>
                <input style={inputStyle} value={data.notes ?? ''} onChange={e => setData({ ...data, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                onClick={saveProjectInfo}
                disabled={saving}
                style={{ background: '#1a1a1a', color: '#fff', border: 'none', padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
              >
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Project Info'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import from Schedule */}
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleImport} style={{ display: 'none' }} />
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => { setImportResult(null); fileInputRef.current?.click() }}
            disabled={importing}
            style={{
              background: importing ? '#ccc' : '#1a1a1a',
              color: '#fff', border: 'none', padding: '8px 18px',
              fontSize: 13, fontWeight: 600,
              cursor: importing ? 'not-allowed' : 'pointer',
            }}
          >
            {importing ? 'Reading fixture schedule…' : '↑ Import from Schedule'}
          </button>
          <span style={{ fontSize: 12, color: '#6b6b6b' }}>Upload a screenshot or PDF of a fixture schedule to auto-populate</span>
        </div>
        {importResult && (
          <div style={{ marginTop: 10, fontSize: 12 }}>
            {importResult.imported.length > 0 && (
              <div style={{ color: '#107c10', fontWeight: 600 }}>
                ✓ Imported {importResult.imported.length} fixture{importResult.imported.length !== 1 ? 's' : ''}
              </div>
            )}
            {importResult.unmatched.length > 0 && (
              <div style={{ color: '#ff8c00', marginTop: 4 }}>
                ⚠ {importResult.unmatched.length} not found in database — add manually: {importResult.unmatched.join(', ')}
              </div>
            )}
            {importResult.imported.length === 0 && importResult.unmatched.length === 0 && (
              <div style={{ color: '#6b6b6b' }}>No fixture entries found in the uploaded document.</div>
            )}
          </div>
        )}
        {importError && (
          <p style={{ color: '#c00', fontSize: 12, marginTop: 4 }}>{importError}</p>
        )}
      </div>

      {/* Add Fixture */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Add Fixture Type</div>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 80px 1fr 1fr 1fr', gap: 10, alignItems: 'end', marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>TYPE *</label>
            <input
              style={inputStyle}
              value={fixtureType}
              onChange={e => setFixtureType(e.target.value)}
              placeholder="A"
              maxLength={4}
            />
          </div>
          <div>
            <label style={labelStyle}>QTY</label>
            <input
              style={inputStyle}
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>PRODUCT SEARCH *</label>
            <input
              style={inputStyle}
              value={selectedProduct ? `${selectedProduct.catalogNumber} — ${selectedProduct.displayName ?? ''}` : searchQuery}
              onChange={e => {
                setSelectedProduct(null)
                setSearchQuery(e.target.value)
              }}
              placeholder="Search catalog #…"
            />
            {searchError && (
              <p style={{ color: '#c00', fontSize: 12, marginTop: 4 }}>Search failed — please try again</p>
            )}
            {searchResults.length > 0 && !selectedProduct && (
              <div style={{ position: 'absolute', zIndex: 20, background: '#fff', border: '1px solid #ccc', width: '100%', maxHeight: 200, overflowY: 'auto', top: '100%' }}>
                {searchResults.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { setSelectedProduct(p); setSearchResults([]) }}
                    style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f0f0f0' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f9')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                  >
                    <strong style={{ color: '#d13438' }}>{p.catalogNumber}</strong>
                    {' '}— {p.displayName ?? ''} <span style={{ color: '#aaa' }}>({p.manufacturer?.name})</span>
                    {!p.specSheetPath && (
                      <span style={{ marginLeft: 6, color: '#f7a600', fontSize: 11 }}>No spec sheet on file</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>LOCATION TAG</label>
            <input style={inputStyle} value={locationTag} onChange={e => setLocationTag(e.target.value)} placeholder="Office 101" />
          </div>
          <div>
            <label style={labelStyle}>NOTES</label>
            <input style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {/* Ordering matrix configurator — attempted for all products; silently hides if no matrix */}
        {selectedProduct && (
          <div style={{ marginTop: 10 }}>
            {catalogOverride ? (
              <div style={{ background: '#f0f4f8', border: '1px solid #0078d4', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 600, textTransform: 'uppercase' }}>Selected:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a1a1a', fontSize: 13 }}>{catalogOverride}</span>
                <button
                  onClick={() => { setCatalogOverride(null); setShowConfigurator(true) }}
                  style={{ marginLeft: 'auto', background: 'none', border: '1px solid #0078d4', color: '#0078d4', padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                >
                  Change
                </button>
              </div>
            ) : showConfigurator ? (
              <ProductConfigurator
                productId={selectedProduct.id}
                currentOverride={null}
                onCatalogBuilt={(s) => { setCatalogOverride(s); setShowConfigurator(false) }}
                onClose={() => setShowConfigurator(false)}
              />
            ) : null}
          </div>
        )}

        {/* Legacy configOptions dropdowns (fallback for older products) */}
        {!selectedProduct?.orderingMatrixId && selectedProduct?.configOptions && Object.keys(selectedProduct.configOptions).length > 0 && (
          <div style={{ background: '#f9f9f9', border: '1px solid #e0e0e0', padding: '12px 14px', marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Configure Fixture
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginBottom: 10 }}>
              {Object.entries(selectedProduct.configOptions).map(([colName, opts]) => (
                <div key={colName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#6b6b6b', whiteSpace: 'nowrap' }}>{colName}:</span>
                  {opts.length === 1 ? (
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#aaa' }}>{opts[0]}</span>
                  ) : (
                    <select
                      value={configSelections[colName] ?? opts[0]}
                      onChange={e => setConfigSelections(prev => ({ ...prev, [colName]: e.target.value }))}
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 6px',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        background: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#6b6b6b' }}>
              Full part number:{' '}
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a1a1a' }}>
                {selectedProduct.catalogNumber}-{Object.values(configSelections).join('-')}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={addFixture}
          disabled={!selectedProduct || !fixtureType || adding}
          style={{
            background: selectedProduct && fixtureType ? '#d13438' : '#ccc',
            color: '#fff',
            border: 'none',
            padding: '8px 18px',
            fontSize: 13,
            marginTop: 10,
            cursor: selectedProduct && fixtureType ? 'pointer' : 'not-allowed',
          }}
        >
          {adding ? 'Adding…' : '+ Add Fixture'}
        </button>
        {addError && (
          <p style={{ color: '#c00', fontSize: 12, marginTop: 4 }}>{addError}</p>
        )}
      </div>
    </div>
  )
}
