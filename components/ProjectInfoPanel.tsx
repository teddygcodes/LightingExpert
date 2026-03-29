'use client'

import { useState } from 'react'

interface ProjectData {
  projectName: string
  projectNumber: string | null
  preparedBy: string | null
  preparedFor: string | null
  revision: string | null
  notes: string | null
}

export type { ProjectData }

const inputStyle = {
  border: '1px solid #ccc',
  padding: '6px 10px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box' as const,
}

const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6b6b6b', marginBottom: 4, display: 'block' }

export default function ProjectInfoPanel({
  submittalId,
  initialData,
}: {
  submittalId: string
  initialData: ProjectData
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [data, setData] = useState(initialData)
  const [showProjectInfo, setShowProjectInfo] = useState(false)

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

  return (
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
  )
}
