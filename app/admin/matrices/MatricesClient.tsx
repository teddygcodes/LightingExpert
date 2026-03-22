'use client'

import { useState } from 'react'

interface MatrixRow {
  id: string
  familyName: string
  baseFamily: string
  separator: string
  sampleNumber: string | null
  confidence: number
  extractionSource: string
  extractedAt: string
  columns: unknown
  suffixOptions: unknown
  manufacturer: { name: string }
  _count: { products: number }
}

export default function MatricesClient({ matrices: initial }: { matrices: MatrixRow[] }) {
  const [matrices, setMatrices] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editColumns, setEditColumns] = useState('')
  const [editSuffixes, setEditSuffixes] = useState('')
  const [editSample, setEditSample] = useState('')
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

  function openEdit(m: MatrixRow) {
    setEditing(m.id)
    setEditColumns(JSON.stringify(m.columns, null, 2))
    setEditSuffixes(JSON.stringify(m.suffixOptions ?? [], null, 2))
    setEditSample(m.sampleNumber ?? '')
    setEditError(null)
  }

  async function saveEdit(matrixId: string) {
    setEditError(null)
    let columns: unknown, suffixOptions: unknown
    try { columns = JSON.parse(editColumns) } catch { setEditError('columns: invalid JSON'); return }
    try { suffixOptions = JSON.parse(editSuffixes) } catch { setEditError('suffixOptions: invalid JSON'); return }
    if (!Array.isArray(columns)) { setEditError('columns must be a JSON array'); return }

    setSaving(true)
    const res = await fetch('/api/admin/matrices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: matrixId, columns, suffixOptions, sampleNumber: editSample }),
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

  const expandedMatrix = expanded ? matrices.find(m => m.id === expanded) : null
  const columns = Array.isArray(expandedMatrix?.columns)
    ? (expandedMatrix?.columns as Array<{ position: number; label: string; shortLabel: string; required: boolean; options: Array<{ code: string; description: string; constraints?: string[] }> }>)
    : []

  return (
    <div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {['Manufacturer', 'Family', 'Base Code', 'Columns', 'Suffixes', 'Products', 'Confidence', 'Source', 'Sample Number', 'Actions'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrices.map((m, idx) => {
            const cols = Array.isArray(m.columns) ? (m.columns as unknown[]).length : 0
            const suffs = Array.isArray(m.suffixOptions) ? (m.suffixOptions as unknown[]).length : 0
            const isExpanded = expanded === m.id
            return (
              <>
                <tr
                  key={m.id}
                  style={{ background: idx % 2 === 0 ? '#fff' : '#f9f9f9', cursor: 'pointer' }}
                  onClick={() => setExpanded(isExpanded ? null : m.id)}
                >
                  <td style={tdStyle}>{m.manufacturer.name}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>{m.familyName}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{m.baseFamily}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{cols}</td>
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
                              onClick={() => saveEdit(m.id)}
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
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                            Columns for {m.familyName} — {cols} required columns + {suffs} suffix options
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            {columns.map(col => (
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
