'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewSubmittalPage() {
  const router = useRouter()
  const [projectName, setProjectName] = useState('')
  const [projectNumber, setProjectNumber] = useState('')
  const [preparedBy, setPreparedBy] = useState('')
  const [preparedFor, setPreparedFor] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!projectName.trim()) { setError('Project name is required'); return }
    setCreating(true)
    const res = await fetch('/api/submittals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, projectNumber, preparedBy, preparedFor }),
    })
    if (!res.ok) { setError('Failed to create submittal'); setCreating(false); return }
    const data = await res.json()
    router.push(`/submittals/${data.id}`)
  }

  const inputStyle = {
    border: '1px solid #ccc',
    padding: '7px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: 11, fontWeight: 600 as const, color: '#6b6b6b', marginBottom: 4, display: 'block' as const }

  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>New Submittal</h1>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: 24 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>PROJECT NAME *</label>
            <input style={inputStyle} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Atlantis KB Office Renovation" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>PROJECT NUMBER</label>
            <input style={inputStyle} value={projectNumber} onChange={e => setProjectNumber(e.target.value)} placeholder="e.g. 2025-001" />
          </div>
          <div>
            <label style={labelStyle}>PREPARED BY</label>
            <input style={inputStyle} value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label style={labelStyle}>PREPARED FOR</label>
            <input style={inputStyle} value={preparedFor} onChange={e => setPreparedFor(e.target.value)} placeholder="Client name" />
          </div>
        </div>

        {error && <div style={{ color: '#d13438', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ background: '#d13438', color: '#fff', border: 'none', padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {creating ? 'Creating…' : 'Create Submittal →'}
          </button>
          <button
            onClick={() => router.push('/submittals')}
            style={{ background: 'none', border: '1px solid #ccc', padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: '#6b6b6b' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
