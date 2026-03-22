'use client'

import { useState } from 'react'
import { Prisma } from '@prisma/client'

interface MatrixRow {
  id: string
  familyName: string
  baseFamily: string
  separator: string
  sampleNumber: string | null
  confidence: number
  extractionSource: string
  extractedAt: string
  columns: Prisma.JsonValue
  suffixOptions: Prisma.JsonValue
  matrixType: string
  skuTable: Prisma.JsonValue | null
  manufacturer: { name: string }
  _count: { products: number }
}

interface SkuEntry {
  stockPartNumber: string
  lumens?: string | number | null
  watts?: string | number | null
  cct?: string | null
  voltage?: string | null
  housing?: string | null
  shortCode?: string | null
  isCommon?: boolean
  position?: number
}

interface ColumnDef {
  position: number
  label: string
  shortLabel: string
  required: boolean
  options: Array<{ code: string; description: string; constraints?: string[] }>
}

export default function MatricesClient({ matrices: initial }: { matrices: MatrixRow[] }) {
  const [matrices, setMatrices] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editColumns, setEditColumns] = useState('')
  const [editSuffixes, setEditSuffixes] = useState('')
  const [editSample, setEditSample] = useState('')
  const [editSkuTable, setEditSkuTable] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reextracting, setReextracting] = useState<string | null>(null)

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    background: '#1a1a1a', color: '#fff', border: '1px solid #333', whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, border: '1px solid #e0e0e0', verticalAlign: 'top',
  }

  const pillBase: React.CSSProperties = {
    display: 'inline-block', fontSize: 10, fontWeight: 700,
    padding: '1px 6px', borderRadius: 3, marginLeft: 6,
    verticalAlign: 'middle', letterSpacing: '0.5px', textTransform: 'uppercase' as const,
  }

  function matrixTypePill(matrixType: string) {
    if (matrixType === 'SKU_TABLE') {
      return <span style={{ ...pillBase, background: '#cce5ff', color: '#004085' }}>SKU TABLE</span>
    }
    if (matrixType === 'HYBRID') {
      return <span style={{ ...pillBase, background: '#e8d5f5', color: '#5a1f8a' }}>HYBRID</span>
    }
    return <span style={{ ...pillBase, background: '#e0e0e0', color: '#333' }}>CONFIGURABLE</span>
  }

  function getSizeLabel(m: MatrixRow): string {
    const colCount = Array.isArray(m.columns) ? (m.columns as unknown[]).length : 0
    const skuCount = Array.isArray(m.skuTable) ? (m.skuTable as unknown[]).length : 0
    if (m.matrixType === 'SKU_TABLE') return `${skuCount} SKUs`
    if (m.matrixType === 'HYBRID') return `${colCount} cols + ${skuCount} SKUs`
    return `${colCount} cols`
  }

  function openEdit(m: MatrixRow) {
    setEditing(m.id)
    setEditColumns(JSON.stringify(m.columns, null, 2))
    setEditSuffixes(JSON.stringify(m.suffixOptions ?? [], null, 2))
    setEditSample(m.sampleNumber ?? '')
    setEditSkuTable(JSON.stringify(m.skuTable ?? [], null, 2))
    setEditError(null)
  }

  async function saveEdit(matrixId: string, matrixType: string) {
    setEditError(null)

    const body: Record<string, unknown> = {
      id: matrixId,
      sampleNumber: editSample,
      matrixType: matrixType === 'SKU_TABLE' ? 'sku_table' : matrixType === 'HYBRID' ? 'hybrid' : 'configurable',
    }

    if (matrixType === 'SKU_TABLE') {
      let skuTable: unknown
      try { skuTable = JSON.parse(editSkuTable) } catch { setEditError('skuTable: invalid JSON'); return }
      if (!Array.isArray(skuTable)) { setEditError('skuTable must be a JSON array'); return }
      body.skuTable = skuTable
      body.columns = null
    } else if (matrixType === 'HYBRID') {
      let columns: unknown, suffixOptions: unknown, skuTable: unknown
      try { columns = JSON.parse(editColumns) } catch { setEditError('columns: invalid JSON'); return }
      try { suffixOptions = JSON.parse(editSuffixes) } catch { setEditError('suffixOptions: invalid JSON'); return }
      try { skuTable = JSON.parse(editSkuTable) } catch { setEditError('skuTable: invalid JSON'); return }
      if (!Array.isArray(columns)) { setEditError('columns must be a JSON array'); return }
      body.columns = columns
      body.suffixOptions = suffixOptions
      body.skuTable = skuTable
    } else {
      // CONFIGURABLE
      let columns: unknown, suffixOptions: unknown
      try { columns = JSON.parse(editColumns) } catch { setEditError('columns: invalid JSON'); return }
      try { suffixOptions = JSON.parse(editSuffixes) } catch { setEditError('suffixOptions: invalid JSON'); return }
      if (!Array.isArray(columns)) { setEditError('columns must be a JSON array'); return }
      body.columns = columns
      body.suffixOptions = suffixOptions
    }

    setSaving(true)
    const res = await fetch('/api/admin/matrices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      const updated = await res.json()
      setMatrices(prev => prev.map(m => m.id === matrixId ? { ...m, ...updated } : m))
      setEditing(null)
    } else {
      const json = await res.json().catch(() => ({}))
      setEditError(json.error ?? 'Save failed')
    }
  }

  async function reextract(matrixId: string) {
    setReextracting(matrixId)
    const res = await fetch(`/api/admin/matrices/${matrixId}/reextract`, { method: 'POST' })
    setReextracting(null)
    if (res.ok) {
      const json = await res.json()
      setMatrices(prev => prev.map(m => m.id === matrixId ? { ...m, ...json.matrix } : m))
    } else {
      const json = await res.json().catch(() => ({}))
      alert(json.error ?? 'Re-extraction failed')
    }
  }

  return (
    <div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {['Manufacturer', 'Family', 'Base Code', 'Size', 'Suffixes', 'Products', 'Confidence', 'Source', 'Sample Number', 'Actions'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrices.map((m, idx) => {
            const suffs = Array.isArray(m.suffixOptions) ? (m.suffixOptions as unknown[]).length : 0
            const isExpanded = expanded === m.id
            const expandedColumns = Array.isArray(m.columns)
              ? (m.columns as unknown as ColumnDef[])
              : []
            const skuEntries = Array.isArray(m.skuTable)
              ? (m.skuTable as unknown as SkuEntry[])
              : []

            return (
              <>
                <tr
                  key={m.id}
                  style={{ background: idx % 2 === 0 ? '#fff' : '#f9f9f9', cursor: 'pointer' }}
                  onClick={() => setExpanded(isExpanded ? null : m.id)}
                >
                  <td style={tdStyle}>{m.manufacturer.name}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>
                    {m.familyName}
                    {matrixTypePill(m.matrixType)}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{m.baseFamily}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{getSizeLabel(m)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{suffs}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{m._count.products}</td>
                  <td style={{ ...tdStyle, color: m.confidence >= 0.8 ? '#107c10' : '#c0392b' }}>
                    {Math.round(m.confidence * 100)}%
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>{m.extractionSource}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{m.sampleNumber ?? '—'}</td>
                  <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setExpanded(m.id); openEdit(m) }}
                        style={{ fontSize: 11, padding: '3px 8px', cursor: 'pointer', border: '1px solid #0078d4', color: '#0078d4', background: 'none' }}
                      >Edit</button>
                      <button
                        onClick={() => reextract(m.id)}
                        disabled={reextracting === m.id}
                        style={{ fontSize: 11, padding: '3px 8px', cursor: 'pointer', border: '1px solid #6b6b6b', color: '#6b6b6b', background: 'none' }}
                      >{reextracting === m.id ? 'Running…' : 'Re-extract'}</button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${m.id}-expanded`}>
                    <td colSpan={10} style={{ padding: 16, background: '#f0f4f8', border: '1px solid #e0e0e0' }}>
                      {editing === m.id ? (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Edit Matrix — {m.familyName}</div>

                          {m.matrixType === 'SKU_TABLE' ? (
                            <div style={{ marginBottom: 12 }}>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#6b6b6b' }}>SKU TABLE JSON</label>
                              <textarea
                                value={editSkuTable}
                                onChange={e => setEditSkuTable(e.target.value)}
                                rows={16}
                                style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, border: '1px solid #ccc', padding: 8, boxSizing: 'border-box', resize: 'vertical' }}
                              />
                            </div>
                          ) : (
                            <>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#6b6b6b' }}>COLUMNS JSON</label>
                                  <textarea
                                    value={editColumns}
                                    onChange={e => setEditColumns(e.target.value)}
                                    rows={12}
                                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, border: '1px solid #ccc', padding: 8, boxSizing: 'border-box', resize: 'vertical' }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#6b6b6b' }}>SUFFIX OPTIONS JSON</label>
                                  <textarea
                                    value={editSuffixes}
                                    onChange={e => setEditSuffixes(e.target.value)}
                                    rows={12}
                                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, border: '1px solid #ccc', padding: 8, boxSizing: 'border-box', resize: 'vertical' }}
                                  />
                                </div>
                              </div>
                              {m.matrixType === 'HYBRID' && (
                                <div style={{ marginBottom: 12 }}>
                                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#6b6b6b' }}>SKU TABLE JSON</label>
                                  <textarea
                                    value={editSkuTable}
                                    onChange={e => setEditSkuTable(e.target.value)}
                                    rows={12}
                                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, border: '1px solid #ccc', padding: 8, boxSizing: 'border-box', resize: 'vertical' }}
                                  />
                                </div>
                              )}
                            </>
                          )}

                          <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#6b6b6b' }}>SAMPLE NUMBER</label>
                            <input
                              value={editSample}
                              onChange={e => setEditSample(e.target.value)}
                              style={{ fontFamily: 'monospace', fontSize: 12, border: '1px solid #ccc', padding: '4px 8px', width: 300 }}
                            />
                          </div>
                          {editError && <div style={{ color: '#d13438', fontSize: 12, marginBottom: 10 }}>{editError}</div>}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => saveEdit(m.id, m.matrixType)}
                              disabled={saving}
                              style={{ background: '#d13438', color: '#fff', border: 'none', padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >{saving ? 'Saving…' : 'Save Changes'}</button>
                            <button
                              onClick={() => setEditing(null)}
                              style={{ background: 'none', border: '1px solid #ccc', padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#444' }}
                            >Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {(m.matrixType === 'SKU_TABLE' || m.matrixType === 'HYBRID') && (
                            <div style={{ marginBottom: m.matrixType === 'HYBRID' ? 16 : 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                                SKU Table for {m.familyName} — {skuEntries.length} SKUs
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: '#e8e8e8' }}>
                                    {['Part Number', 'Lumens', 'Watts', 'CCT', 'Voltage', 'Housing', 'Short Code', 'Common'].map(h => (
                                      <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, border: '1px solid #ccc' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {skuEntries.map((entry, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                      <td style={{ fontFamily: 'monospace', fontWeight: 600, padding: '4px 6px', border: '1px solid #e8e8e8' }}>{entry.stockPartNumber}</td>
                                      <td style={{ padding: '4px 6px', border: '1px solid #e8e8e8' }}>{entry.lumens ?? '—'}</td>
                                      <td style={{ padding: '4px 6px', border: '1px solid #e8e8e8' }}>{entry.watts ?? '—'}</td>
                                      <td style={{ padding: '4px 6px', border: '1px solid #e8e8e8' }}>{entry.cct ?? '—'}</td>
                                      <td style={{ padding: '4px 6px', border: '1px solid #e8e8e8' }}>{entry.voltage ?? '—'}</td>
                                      <td style={{ padding: '4px 6px', border: '1px solid #e8e8e8' }}>{entry.housing ?? '—'}</td>
                                      <td style={{ padding: '4px 6px', border: '1px solid #e8e8e8' }}>{entry.shortCode ?? '—'}</td>
                                      <td style={{ padding: '4px 6px', border: '1px solid #e8e8e8', textAlign: 'center' }}>{entry.isCommon ? '★' : ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {m.matrixType === 'HYBRID' && (
                            <hr style={{ border: 'none', borderTop: '2px solid #ccc', margin: '16px 0' }} />
                          )}

                          {(m.matrixType === 'CONFIGURABLE' || m.matrixType === 'HYBRID') && (
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                                Columns for {m.familyName} — {expandedColumns.length} required columns + {suffs} suffix options
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                {expandedColumns.map(col => (
                                  <div key={col.position} style={{ background: '#fff', border: '1px solid #e0e0e0', padding: '8px 12px', minWidth: 140 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', marginBottom: 6 }}>
                                      [{col.position}] {col.label}{col.required ? ' *' : ''}
                                    </div>
                                    {col.options.map(opt => (
                                      <div key={opt.code} style={{ fontSize: 11, marginBottom: 2 }}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#d13438' }}>{opt.code}</span>
                                        {' '}— {opt.description}
                                        {opt.constraints && opt.constraints.length > 0 && (
                                          <span style={{ color: '#f7a600', marginLeft: 4 }}>&#9888;</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                              {Array.isArray(m.suffixOptions) && (m.suffixOptions as unknown[]).length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', marginBottom: 6 }}>SUFFIX OPTIONS (optional add-ons)</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {(m.suffixOptions as Array<{ code: string; description: string }>).map(s => (
                                      <div key={s.code} style={{ background: '#fff', border: '1px solid #e0e0e0', padding: '4px 10px', fontSize: 11 }}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.code}</span> — {s.description}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {m.matrixType !== 'CONFIGURABLE' && m.matrixType !== 'HYBRID' && m.matrixType !== 'SKU_TABLE' && (
                            <div style={{ fontSize: 12, color: '#999' }}>Unknown matrix type: {m.matrixType}</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
