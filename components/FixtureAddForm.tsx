'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import ProductConfigurator from './ProductConfigurator'

interface ProductOption {
  id: string
  catalogNumber: string
  displayName: string | null
  specSheetPath: string | null
  configOptions: Record<string, string[]> | null
  orderingMatrixId: string | null
  manufacturer: { name: string } | null
}

interface FixtureAddFormProps {
  submittalId: string
  onAdded: () => void
}

const inputStyle = {
  border: '1px solid #ccc',
  padding: '6px 10px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box' as const,
}

const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6b6b6b', marginBottom: 4, display: 'block' }

export default function FixtureAddForm({ submittalId, onAdded }: FixtureAddFormProps) {
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

  useEffect(() => {
    setCatalogOverride(null)
    if (!selectedProduct) { setConfigSelections({}); setShowConfigurator(false); return }
    setShowConfigurator(true)
    if (!selectedProduct.configOptions) { setConfigSelections({}); return }
    setConfigSelections(
      Object.fromEntries(Object.entries(selectedProduct.configOptions).map(([k, opts]) => [k, opts[0] ?? '']))
    )
  }, [selectedProduct])

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
      onAdded()
    } catch {
      setAddError('Network error — please try again')
    } finally {
      setAdding(false)
    }
  }

  return (
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
  )
}
