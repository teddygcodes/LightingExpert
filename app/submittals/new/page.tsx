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

  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>New Submittal</h1>

      <div className="bg-[var(--surface)] border border-[var(--border)]" style={{ padding: 24 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="field-label">PROJECT NAME *</label>
            <input className="field-input" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Atlantis KB Office Renovation" autoFocus />
          </div>
          <div>
            <label className="field-label">PROJECT NUMBER</label>
            <input className="field-input" value={projectNumber} onChange={e => setProjectNumber(e.target.value)} placeholder="e.g. 2025-001" />
          </div>
          <div>
            <label className="field-label">PREPARED BY</label>
            <input className="field-input" value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="field-label">PREPARED FOR</label>
            <input className="field-input" value={preparedFor} onChange={e => setPreparedFor(e.target.value)} placeholder="Client name" />
          </div>
        </div>

        {error && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {creating ? 'Creating…' : 'Create Submittal →'}
          </button>
          <button
            onClick={() => router.push('/submittals')}
            style={{ background: 'none', border: '1px solid var(--border-strong)', padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
