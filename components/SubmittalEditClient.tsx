'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ProductConfigurator from './ProductConfigurator'

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  catalogNumber: string
  displayName: string | null
  familyName: string | null
  manufacturer: { name: string; slug: string } | null
  orderingMatrixId: string | null
}

interface EditableItem {
  id: string
  fixtureType: string
  quantity: number
  catalogNumberOverride: string | null
  location: string | null
  notes: string | null
  sortOrder: number
  product: Product
}

interface SubmittalData {
  id: string
  projectName: string
  projectNumber: string | null
  projectAddress: string | null
  clientName: string | null
  contractorName: string | null
  preparedBy: string | null
  preparedFor: string | null
  revisionNumber: number
  notes: string | null
  status: string
  pdfUrl: string | null
  items: EditableItem[]
}

interface ProductSearchResult {
  id: string
  catalogNumber: string
  displayName: string | null
  familyName: string | null
  manufacturer: { name: string } | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const EDITABLE_FIELDS = ['fixtureType', 'quantity', 'catalogNumberOverride', 'location', 'notes'] as const
type EditableField = typeof EDITABLE_FIELDS[number]

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #0078d4',
  outline: 'none',
  padding: '4px 6px',
  fontSize: 12,
  fontFamily: 'inherit',
  background: '#fff',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b6b6b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 4,
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SubmittalEditClient({ initial }: { initial: SubmittalData }) {
  const [items, setItems] = useState<EditableItem[]>(initial.items)
  const [projectFields, setProjectFields] = useState({
    projectName: initial.projectName,
    projectNumber: initial.projectNumber ?? '',
    projectAddress: initial.projectAddress ?? '',
    clientName: initial.clientName ?? '',
    contractorName: initial.contractorName ?? '',
    preparedBy: initial.preparedBy ?? '',
    preparedFor: initial.preparedFor ?? '',
    revisionNumber: String(initial.revisionNumber),
    notes: initial.notes ?? '',
  })
  const [pdfUrl, setPdfUrl] = useState(initial.pdfUrl)
  const [status, setStatus] = useState(initial.status)

  // Inline cell editing
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: EditableField } | null>(null)
  const [cellValues, setCellValues] = useState<Record<string, Record<string, string>>>({})
  const [cellFlash, setCellFlash] = useState<Record<string, Record<string, 'saved' | 'error'>>>({})
  const [cellErrors, setCellErrors] = useState<Record<string, Record<string, string>>>({})

  // Add fixture form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addType, setAddType] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState<ProductSearchResult[]>([])
  const [addProduct, setAddProduct] = useState<ProductSearchResult | null>(null)
  const [addLocation, setAddLocation] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [adding, setAdding] = useState(false)

  // Generate / confirmation modal
  const [showConfirm, setShowConfirm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genWarnings, setGenWarnings] = useState<string[]>([])

  // Configurator panel
  const [configuratorItemId, setConfiguratorItemId] = useState<string | null>(null)

  const editingCellRef = useRef(editingCell)
  editingCellRef.current = editingCell

  // ── Dirty-state guard on navigate ──────────────────────────────────────────
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (editingCellRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // ── Product search for add form ────────────────────────────────────────────
  useEffect(() => {
    if (addSearch.length < 2) { setAddResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/products?search=${encodeURIComponent(addSearch)}&limit=8`)
      if (res.ok) setAddResults(await res.json())
    }, 200)
    return () => clearTimeout(timer)
  }, [addSearch])

  // ── Cell helpers ───────────────────────────────────────────────────────────

  function getCellValue(item: EditableItem, field: EditableField): string {
    const overridden = cellValues[item.id]?.[field]
    if (overridden !== undefined) return overridden
    if (field === 'quantity') return String(item.quantity)
    if (field === 'catalogNumberOverride') return item.catalogNumberOverride ?? ''
    return (item[field] as string | null) ?? ''
  }

  function getSavedValue(item: EditableItem, field: EditableField): string {
    if (field === 'quantity') return String(item.quantity)
    if (field === 'catalogNumberOverride') return item.catalogNumberOverride ?? ''
    return (item[field] as string | null) ?? ''
  }

  function startEdit(itemId: string, field: EditableField, currentValue: string) {
    setEditingCell({ itemId, field })
    setCellValues(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? {}), [field]: currentValue },
    }))
  }

  function setFlash(itemId: string, field: string, type: 'saved' | 'error') {
    setCellFlash(prev => ({ ...prev, [itemId]: { ...(prev[itemId] ?? {}), [field]: type } }))
    setTimeout(() => {
      setCellFlash(prev => {
        const copy = { ...prev }
        if (copy[itemId]) {
          copy[itemId] = { ...copy[itemId] }
          delete copy[itemId][field]
        }
        return copy
      })
    }, 1500)
  }

  const saveCell = useCallback(async (itemId: string, field: EditableField, value: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const saved = getSavedValue(item, field)
    if (value === saved) { setEditingCell(null); return }

    const body: Record<string, unknown> = { action: 'update_item', itemId, [field]: value }
    if (field === 'quantity') body[field] = Number(value)

    const res = await fetch(`/api/submittals/${initial.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const updated = await res.json()
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updated } : i))
      setCellValues(prev => {
        const copy = { ...prev }
        if (copy[itemId]) {
          copy[itemId] = { ...copy[itemId] }
          delete copy[itemId][field]
        }
        return copy
      })
      setCellErrors(prev => {
        const copy = { ...prev }
        if (copy[itemId]) { copy[itemId] = { ...copy[itemId] }; delete copy[itemId][field] }
        return copy
      })
      setFlash(itemId, field, 'saved')
    } else {
      const json = await res.json().catch(() => ({}))
      setCellErrors(prev => ({
        ...prev,
        [itemId]: { ...(prev[itemId] ?? {}), [field]: json.error ?? 'Save failed' },
      }))
      setFlash(itemId, field, 'error')
    }
    setEditingCell(null)
  }, [items, initial.id])

  function moveFocus(itemId: string, field: EditableField, direction: 'next' | 'prev') {
    const fieldIdx = EDITABLE_FIELDS.indexOf(field)
    const itemIdx = items.findIndex(i => i.id === itemId)

    let nextFieldIdx = direction === 'next' ? fieldIdx + 1 : fieldIdx - 1
    let nextItemIdx = itemIdx

    if (nextFieldIdx >= EDITABLE_FIELDS.length) { nextFieldIdx = 0; nextItemIdx++ }
    if (nextFieldIdx < 0) { nextFieldIdx = EDITABLE_FIELDS.length - 1; nextItemIdx-- }

    const nextItem = items[nextItemIdx]
    if (!nextItem) return

    const nextField = EDITABLE_FIELDS[nextFieldIdx]
    const val = getSavedValue(nextItem, nextField)
    setEditingCell({ itemId: nextItem.id, field: nextField })
    setCellValues(prev => ({
      ...prev,
      [nextItem.id]: { ...(prev[nextItem.id] ?? {}), [nextField]: val },
    }))
  }

  // ── Inline cell renderer ───────────────────────────────────────────────────

  function renderCell(item: EditableItem, field: EditableField) {
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === field
    const value = getCellValue(item, field)
    const flash = cellFlash[item.id]?.[field]
    const errMsg = cellErrors[item.id]?.[field]

    const cellBorder = flash === 'error' ? '1px solid #d13438'
      : isEditing ? '1px solid #0078d4'
      : '1px solid transparent'

    const displayValue = field === 'catalogNumberOverride'
      ? (item.catalogNumberOverride ?? item.product.catalogNumber)
      : value

    if (isEditing) {
      const isMonospace = field === 'catalogNumberOverride' || field === 'fixtureType'
      return (
        <td
          key={field}
          style={{ padding: '2px 4px', border: '1px solid #e0e0e0', position: 'relative' }}
        >
          <input
            autoFocus
            value={value}
            type={field === 'quantity' ? 'number' : 'text'}
            min={field === 'quantity' ? 1 : undefined}
            step={field === 'quantity' ? 1 : undefined}
            placeholder={field === 'catalogNumberOverride' ? item.product.catalogNumber : undefined}
            style={{
              ...inputStyle,
              fontFamily: isMonospace ? 'monospace' : 'inherit',
              border: cellBorder,
            }}
            onChange={e => setCellValues(prev => ({
              ...prev,
              [item.id]: { ...(prev[item.id] ?? {}), [field]: e.target.value },
            }))}
            onBlur={() => saveCell(item.id, field, value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.currentTarget.blur(); return }
              if (e.key === 'Escape') {
                setCellValues(prev => {
                  const copy = { ...prev }
                  if (copy[item.id]) { copy[item.id] = { ...copy[item.id] }; delete copy[item.id][field] }
                  return copy
                })
                setEditingCell(null)
                return
              }
              if (e.key === 'Tab') {
                e.preventDefault()
                saveCell(item.id, field, value)
                moveFocus(item.id, field, e.shiftKey ? 'prev' : 'next')
              }
            }}
          />
          {field === 'catalogNumberOverride' && (
            <div style={{ fontSize: 10, color: '#888', marginTop: 2, fontFamily: 'monospace' }}>
              orig: {item.product.catalogNumber}
            </div>
          )}
          {errMsg && (
            <div style={{ fontSize: 10, color: '#d13438', marginTop: 2 }}>{errMsg}</div>
          )}
        </td>
      )
    }

    // Configurator panel — renders below its row, not inline
    if (field === 'catalogNumberOverride' && item.product.orderingMatrixId && configuratorItemId === item.id) {
      // Configurator is open for this item — show a non-editable cell with close option
      return (
        <td
          key={field}
          style={{
            padding: '6px 8px',
            border: '1px solid #0078d4',
            fontSize: 12,
            fontFamily: 'monospace',
            background: '#f0f4f8',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#0078d4', fontWeight: 600 }}>{displayValue}</span>
          <button
            onClick={() => setConfiguratorItemId(null)}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 11 }}
          >close</button>
        </td>
      )
    }

    if (field === 'catalogNumberOverride' && item.product.orderingMatrixId) {
      // Has matrix — show value + Configure button
      return (
        <td
          key={field}
          style={{
            padding: '6px 8px',
            border: '1px solid #e0e0e0',
            fontSize: 12,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: item.catalogNumberOverride ? '#1a1a1a' : '#bbb' }}>
            {displayValue || '—'}
          </span>
          {item.catalogNumberOverride && (
            <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>(override)</span>
          )}
          <button
            onClick={() => setConfiguratorItemId(item.id)}
            style={{
              marginLeft: 8,
              background: 'none',
              border: '1px solid #0078d4',
              color: '#0078d4',
              padding: '1px 6px',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >Configure ▼</button>
        </td>
      )
    }

    return (
      <td
        key={field}
        onClick={() => startEdit(item.id, field, displayValue)}
        title={field === 'catalogNumberOverride' && item.catalogNumberOverride ? `orig: ${item.product.catalogNumber}` : undefined}
        style={{
          padding: '6px 8px',
          border: '1px solid #e0e0e0',
          cursor: 'text',
          fontSize: 12,
          fontFamily: field === 'catalogNumberOverride' || field === 'fixtureType' ? 'monospace' : 'inherit',
          color: field === 'notes' || field === 'location' ? '#555' : '#1a1a1a',
          position: 'relative',
          whiteSpace: 'nowrap',
          maxWidth: field === 'notes' ? 160 : undefined,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {flash === 'saved' && (
          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', color: '#107c10', fontSize: 11, fontWeight: 700 }}>✓</span>
        )}
        {flash === 'error' && (
          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', color: '#d13438', fontSize: 11 }}>!</span>
        )}
        {displayValue || <span style={{ color: '#bbb' }}>—</span>}
        {field === 'catalogNumberOverride' && item.catalogNumberOverride && (
          <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>(override)</span>
        )}
      </td>
    )
  }

  // ── Reorder ────────────────────────────────────────────────────────────────

  async function reorder(itemId: string, direction: 'up' | 'down') {
    const res = await fetch(`/api/submittals/${initial.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', itemId, direction }),
    })
    if (res.ok) {
      setItems(prev => {
        const arr = [...prev]
        const idx = arr.findIndex(i => i.id === itemId)
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= arr.length) return arr;
        [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]]
        return arr
      })
    }
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  async function removeItem(itemId: string) {
    if (!window.confirm('Remove this fixture from the submittal?')) return
    await fetch(`/api/submittals/${initial.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_item', itemId }),
    })
    setItems(prev => prev.filter(i => i.id !== itemId))
  }

  // ── Add fixture ────────────────────────────────────────────────────────────

  async function addFixture() {
    if (!addProduct || !addType) return
    setAdding(true)
    const res = await fetch(`/api/submittals/${initial.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_item',
        productId: addProduct.id,
        fixtureType: addType,
        quantity: Number(addQty) || 1,
        location: addLocation,
        notes: addNotes,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      // Fetch full item with product details by reloading items
      const fullRes = await fetch(`/api/submittals/${initial.id}`)
      if (fullRes.ok) {
        const full = await fullRes.json()
        setItems(full.items)
      } else {
        setItems(prev => [...prev, data])
      }
      setAddType(''); setAddQty('1'); setAddSearch(''); setAddProduct(null)
      setAddLocation(''); setAddNotes(''); setShowAddForm(false)
    }
    setAdding(false)
  }

  // ── Save project info ──────────────────────────────────────────────────────

  async function saveProjectField(field: keyof typeof projectFields, value: string) {
    const apiField = field === 'revisionNumber'
      ? 'revisionNumber'
      : field
    await fetch(`/api/submittals/${initial.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [apiField]: field === 'revisionNumber' ? Number(value) : value }),
    })
  }

  // ── Generate PDF ───────────────────────────────────────────────────────────

  async function generate() {
    setShowConfirm(false)
    setGenerating(true)
    setGenError(null)
    setGenWarnings([])
    const res = await fetch(`/api/submittals/${initial.id}/generate`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setGenError(json.error ?? 'Generation failed')
    } else {
      setGenWarnings(json.warnings ?? [])
      setPdfUrl(json.pdfUrl)
      setStatus('GENERATED')
    }
    setGenerating(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 40px' }}>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, padding: '12px 16px', background: '#f9f9f9', border: '1px solid #e0e0e0', flexWrap: 'wrap' }}>
        <a
          href={`/submittals/${initial.id}`}
          style={{ color: '#0078d4', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          ← Back to Submittal
        </a>

        <div style={{ width: 1, height: 18, background: '#ddd' }} />

        <button
          onClick={() => setShowConfirm(true)}
          disabled={generating || items.length === 0}
          style={{
            background: items.length === 0 ? '#ccc' : '#d13438',
            color: '#fff',
            border: 'none',
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 600,
            cursor: items.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {generating ? 'Generating PDF…' : 'Generate PDF Package'}
        </button>

        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0078d4', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
          >
            ↓ Download Last PDF ↗
          </a>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', background: status === 'FINAL' ? '#107c10' : '#6b6b6b', color: '#fff' }}>
          {status.replace(/_/g, ' ')}
        </span>
      </div>

      {genError && (
        <div style={{ background: '#fdf2f2', border: '1px solid #f4c2c2', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c0392b' }}>
          Error: {genError}
        </div>
      )}
      {genWarnings.length > 0 && (
        <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <strong>Warnings:</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            {genWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Project Info */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', fontSize: 13, fontWeight: 700 }}>
          Project Information
        </div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
          {([
            ['projectName', 'Project Name *'],
            ['projectNumber', 'Project Number'],
            ['projectAddress', 'Project Address'],
            ['clientName', 'Client Name'],
            ['contractorName', 'Contractor'],
            ['preparedBy', 'Prepared By'],
            ['preparedFor', 'Prepared For'],
            ['revisionNumber', 'Revision #'],
          ] as [keyof typeof projectFields, string][]).map(([field, label]) => (
            <div key={field}>
              <label style={labelStyle}>{label}</label>
              <input
                type={field === 'revisionNumber' ? 'number' : 'text'}
                value={projectFields[field]}
                onChange={e => setProjectFields(prev => ({ ...prev, [field]: e.target.value }))}
                onBlur={e => saveProjectField(field, e.target.value)}
                style={{
                  width: '100%',
                  border: '1px solid #ccc',
                  padding: '6px 10px',
                  fontSize: 13,
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={projectFields.notes}
              rows={2}
              onChange={e => setProjectFields(prev => ({ ...prev, notes: e.target.value }))}
              onBlur={e => saveProjectField('notes', e.target.value)}
              style={{ width: '100%', border: '1px solid #ccc', padding: '6px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }}
            />
          </div>
        </div>
      </div>

      {/* Fixture Schedule */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', fontSize: 13, fontWeight: 700 }}>
          Fixture Schedule — click any cell to edit
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1a1a1a', color: '#fff' }}>
                {['TYPE', 'QTY', 'CATALOG #', 'DESCRIPTION', 'MANUFACTURER', 'LOCATION', 'NOTES', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', border: '1px solid #333' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: 13 }}>
                    No fixtures added yet. Use the form below to add fixtures.
                  </td>
                </tr>
              )}
              {items.map((item, idx) => (
                <>
                  <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                    {renderCell(item, 'fixtureType')}
                    {renderCell(item, 'quantity')}
                    {renderCell(item, 'catalogNumberOverride')}

                    {/* Read-only: Description */}
                    <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', fontSize: 12, color: '#888', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.product.displayName ?? item.product.familyName ?? '—'}
                    </td>

                    {/* Read-only: Manufacturer */}
                    <td style={{ padding: '6px 8px', border: '1px solid #e0e0e0', fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>
                      {item.product.manufacturer?.name ?? '—'}
                    </td>

                    {renderCell(item, 'location')}
                    {renderCell(item, 'notes')}

                    {/* Actions */}
                    <td style={{ padding: '4px 6px', border: '1px solid #e0e0e0', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => reorder(item.id, 'up')}
                          disabled={idx === 0}
                          title="Move up"
                          style={{ background: 'none', border: '1px solid #ddd', cursor: idx === 0 ? 'not-allowed' : 'pointer', padding: '2px 6px', fontSize: 11, opacity: idx === 0 ? 0.3 : 1 }}
                        >↑</button>
                        <button
                          onClick={() => reorder(item.id, 'down')}
                          disabled={idx === items.length - 1}
                          title="Move down"
                          style={{ background: 'none', border: '1px solid #ddd', cursor: idx === items.length - 1 ? 'not-allowed' : 'pointer', padding: '2px 6px', fontSize: 11, opacity: idx === items.length - 1 ? 0.3 : 1 }}
                        >↓</button>
                        <button
                          onClick={() => removeItem(item.id)}
                          title="Remove fixture"
                          style={{ background: 'none', border: '1px solid #ddd', cursor: 'pointer', padding: '2px 6px', fontSize: 11, color: '#d13438' }}
                        >×</button>
                      </div>
                    </td>
                  </tr>
                  {configuratorItemId === item.id && item.product.orderingMatrixId && (
                    <tr key={`${item.id}-configurator`}>
                      <td colSpan={8} style={{ padding: 0, border: '1px solid #0078d4' }}>
                        <ProductConfigurator
                          productId={item.product.id}
                          submittalItemId={item.id}
                          currentOverride={item.catalogNumberOverride}
                          onCatalogBuilt={async (catalogString, _isComplete) => {
                            await saveCell(item.id, 'catalogNumberOverride', catalogString)
                            setConfiguratorItemId(null)
                          }}
                          onClose={() => setConfiguratorItemId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Fixture */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e0e0e0' }}>
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              style={{ background: 'none', border: '1px solid #0078d4', color: '#0078d4', padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              ＋ Add Fixture
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '70px 70px 1fr 140px 200px', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>TYPE</label>
                <input
                  value={addType}
                  onChange={e => setAddType(e.target.value.toUpperCase())}
                  placeholder="A"
                  maxLength={6}
                  style={{ width: '100%', border: '1px solid #ccc', padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={labelStyle}>QTY</label>
                <input
                  type="number"
                  min={1}
                  value={addQty}
                  onChange={e => setAddQty(e.target.value)}
                  style={{ width: '100%', border: '1px solid #ccc', padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>PRODUCT SEARCH</label>
                <input
                  value={addProduct ? (addProduct.displayName ?? addProduct.catalogNumber) : addSearch}
                  onChange={e => { setAddSearch(e.target.value); setAddProduct(null) }}
                  placeholder="Search catalog number or name…"
                  style={{ width: '100%', border: '1px solid #ccc', padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                />
                {addResults.length > 0 && !addProduct && (
                  <div style={{ position: 'absolute', zIndex: 200, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ccc', maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {addResults.map(r => (
                      <div
                        key={r.id}
                        onClick={() => { setAddProduct(r); setAddSearch(''); setAddResults([]) }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f0f0f0' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      >
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.catalogNumber}</span>
                        <span style={{ color: '#888', marginLeft: 8 }}>{r.displayName ?? r.familyName}</span>
                        <span style={{ color: '#aaa', marginLeft: 8 }}>{r.manufacturer?.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>LOCATION</label>
                <input
                  value={addLocation}
                  onChange={e => setAddLocation(e.target.value)}
                  placeholder="e.g. Office 101"
                  style={{ width: '100%', border: '1px solid #ccc', padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <button
                  onClick={addFixture}
                  disabled={adding || !addProduct || !addType}
                  style={{ flex: 1, background: !addProduct || !addType ? '#ccc' : '#d13438', color: '#fff', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: !addProduct || !addType ? 'not-allowed' : 'pointer' }}
                >
                  {adding ? 'Adding…' : 'Add'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setAddSearch(''); setAddProduct(null) }}
                  style={{ background: 'none', border: '1px solid #ddd', padding: '7px 10px', fontSize: 13, cursor: 'pointer', color: '#6b6b6b' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ background: '#fff', width: 420, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Generate PDF Package?</div>
            <p style={{ fontSize: 13, color: '#444', marginBottom: 20, lineHeight: 1.5 }}>
              This will generate a professional submittal PDF for <strong>{projectFields.projectName}</strong> with{' '}
              <strong>{items.length} fixture type{items.length !== 1 ? 's' : ''}</strong>. Any previous PDF will be replaced.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ background: 'none', border: '1px solid #ccc', padding: '8px 18px', fontSize: 13, cursor: 'pointer', color: '#444' }}
              >
                Cancel
              </button>
              <button
                onClick={generate}
                style={{ background: '#d13438', color: '#fff', border: 'none', padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
