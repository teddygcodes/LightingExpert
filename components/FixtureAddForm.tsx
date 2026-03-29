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

const inputCls = 'border border-[var(--border-strong)] px-2.5 py-1.5 text-[13px] w-full box-border'
const labelCls = 'text-[11px] font-semibold text-[var(--text-muted)] mb-1 block'

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
    <div className="bg-[var(--surface)] border border-[var(--border)] p-5">
      <div className="text-[13px] font-bold mb-3.5">Add Fixture Type</div>
      <div className="grid grid-cols-[60px_80px_1fr_1fr_1fr] gap-2.5 items-end mb-2.5">
        <div>
          <label className={labelCls}>TYPE *</label>
          <input
            className={inputCls}
            value={fixtureType}
            onChange={e => setFixtureType(e.target.value)}
            placeholder="A"
            maxLength={4}
          />
        </div>
        <div>
          <label className={labelCls}>QTY</label>
          <input
            className={inputCls}
            type="number"
            min={1}
            value={quantity}
            onChange={e => setQuantity(Number(e.target.value))}
          />
        </div>
        <div className="relative">
          <label className={labelCls}>PRODUCT SEARCH *</label>
          <input
            className={inputCls}
            value={selectedProduct ? `${selectedProduct.catalogNumber} — ${selectedProduct.displayName ?? ''}` : searchQuery}
            onChange={e => {
              setSelectedProduct(null)
              setSearchQuery(e.target.value)
            }}
            placeholder="Search catalog #…"
          />
          {searchError && (
            <p className="text-[#c00] text-xs mt-1">Search failed — please try again</p>
          )}
          {searchResults.length > 0 && !selectedProduct && (
            <div className="absolute z-20 bg-[var(--surface)] border border-[var(--border-strong)] w-full max-h-[200px] overflow-y-auto top-full">
              {searchResults.map(p => (
                <div
                  key={p.id}
                  onClick={() => { setSelectedProduct(p); setSearchResults([]) }}
                  className="px-2.5 py-1.5 cursor-pointer text-xs border-b border-b-[var(--bg)] hover:bg-[var(--surface-raised)] bg-[var(--surface)]"
                >
                  <strong className="text-[var(--accent)]">{p.catalogNumber}</strong>
                  {' '}— {p.displayName ?? ''} <span className="text-[var(--text-faint)]">({p.manufacturer?.name})</span>
                  {!p.specSheetPath && (
                    <span className="ml-1.5 text-[#f7a600] text-[11px]">No spec sheet on file</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>LOCATION TAG</label>
          <input className={inputCls} value={locationTag} onChange={e => setLocationTag(e.target.value)} placeholder="Office 101" />
        </div>
        <div>
          <label className={labelCls}>NOTES</label>
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      {selectedProduct && (
        <div className="mt-2.5">
          {catalogOverride ? (
            <div className="bg-[#f0f4f8] border border-[#0078d4] px-3.5 py-2.5 flex items-center gap-3">
              <span className="text-[11px] text-[var(--text-muted)] font-semibold uppercase">Selected:</span>
              <span className="font-mono font-bold text-[var(--text)] text-[13px]">{catalogOverride}</span>
              <button
                onClick={() => { setCatalogOverride(null); setShowConfigurator(true) }}
                className="ml-auto bg-transparent border border-[#0078d4] text-[#0078d4] px-2 py-0.5 text-[11px] cursor-pointer font-semibold"
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
        <div className="bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-3 mt-2.5">
          <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-2.5">
            Configure Fixture
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-2.5">
            {Object.entries(selectedProduct.configOptions).map(([colName, opts]) => (
              <div key={colName} className="flex items-center gap-1.5">
                <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">{colName}:</span>
                {opts.length === 1 ? (
                  <span className="text-xs font-mono text-[var(--text-faint)]">{opts[0]}</span>
                ) : (
                  <select
                    value={configSelections[colName] ?? opts[0]}
                    onChange={e => setConfigSelections(prev => ({ ...prev, [colName]: e.target.value }))}
                    className="border border-[var(--border-strong)] px-1.5 py-[3px] text-xs font-mono bg-[var(--surface)] cursor-pointer"
                  >
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            Full part number:{' '}
            <span className="font-mono font-bold text-[var(--text)]">
              {selectedProduct.catalogNumber}-{Object.values(configSelections).join('-')}
            </span>
          </div>
        </div>
      )}

      <button
        onClick={addFixture}
        disabled={!selectedProduct || !fixtureType || adding}
        className={`border-none text-white px-[18px] py-2 text-[13px] mt-2.5 ${
          selectedProduct && fixtureType
            ? 'bg-[var(--accent)] cursor-pointer'
            : 'bg-[var(--border-strong)] cursor-not-allowed'
        }`}
      >
        {adding ? 'Adding…' : '+ Add Fixture'}
      </button>
      {addError && (
        <p className="text-[#c00] text-xs mt-1">{addError}</p>
      )}
    </div>
  )
}
