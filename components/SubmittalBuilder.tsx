'use client'

import { useState, useEffect } from 'react'

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
  manufacturer: { name: string } | null
}

export default function SubmittalBuilder({ submittalId, initialData, onRefresh }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [data, setData] = useState(initialData)

  // Fixture add form
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProductOption[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [fixtureType, setFixtureType] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [locationTag, setLocationTag] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [configSelections, setConfigSelections] = useState<Record<string, string>>({})

  // Reset config selections whenever a new product is selected
  useEffect(() => {
    if (!selectedProduct?.configOptions) { setConfigSelections({}); return }
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

  async function searchProducts(q: string) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`)
    const json = await res.json()
    setSearchResults(json.data ?? [])
  }

  async function addFixture() {
    if (!selectedProduct || !fixtureType) return
    setAdding(true)

    // Build full part number from config selections if available
    const hasConfig = selectedProduct.configOptions && Object.keys(configSelections).length > 0
    const configSuffix = hasConfig ? '-' + Object.values(configSelections).join('-') : ''
    const fullCatalogNumber = selectedProduct.catalogNumber + configSuffix

    await fetch(`/api/submittals/${submittalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_item',
        productId: selectedProduct.id,
        fixtureType: fixtureType.toUpperCase(),
        quantity,
        locationTag: locationTag || null,
        catalogNumberOverride: hasConfig ? fullCatalogNumber : undefined,
        notes: notes || null,
      }),
    })
    setSelectedProduct(null)
    setSearchQuery('')
    setSearchResults([])
    setFixtureType('')
    setQuantity(1)
    setLocationTag('')
    setNotes('')
    setConfigSelections({})
    setAdding(false)
    onRefresh()
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
      {/* Project Info */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Project Information</div>
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
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Project Info'}
          </button>
        </div>
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
              onChange={e => { setSelectedProduct(null); searchProducts(e.target.value) }}
              placeholder="Search catalog #…"
            />
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
        {/* Config dropdowns — shown when selected product has configOptions */}
        {selectedProduct?.configOptions && Object.keys(selectedProduct.configOptions).length > 0 && (
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
      </div>
    </div>
  )
}
