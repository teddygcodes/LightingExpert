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
    <div className="bg-[var(--surface)] border border-[var(--border)] mb-5">
      <button
        onClick={() => setShowProjectInfo(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3 bg-transparent border-none cursor-pointer text-[13px] font-bold text-left"
      >
        <span>Edit Project Info</span>
        <span className="text-[11px] text-[var(--text-muted)]">{showProjectInfo ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {showProjectInfo && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">PROJECT NAME *</label>
              <input className="field-input" value={data.projectName} onChange={e => setData({ ...data, projectName: e.target.value })} />
            </div>
            <div>
              <label className="field-label">PROJECT NUMBER</label>
              <input className="field-input" value={data.projectNumber ?? ''} onChange={e => setData({ ...data, projectNumber: e.target.value })} />
            </div>
            <div>
              <label className="field-label">PREPARED BY</label>
              <input className="field-input" value={data.preparedBy ?? ''} onChange={e => setData({ ...data, preparedBy: e.target.value })} />
            </div>
            <div>
              <label className="field-label">PREPARED FOR</label>
              <input className="field-input" value={data.preparedFor ?? ''} onChange={e => setData({ ...data, preparedFor: e.target.value })} />
            </div>
            <div>
              <label className="field-label">REVISION</label>
              <input className="field-input" value={data.revision ?? ''} onChange={e => setData({ ...data, revision: e.target.value })} placeholder="Rev 0" />
            </div>
            <div>
              <label className="field-label">NOTES</label>
              <input className="field-input" value={data.notes ?? ''} onChange={e => setData({ ...data, notes: e.target.value })} />
            </div>
          </div>
          <div className="mt-3.5">
            <button
              onClick={saveProjectInfo}
              disabled={saving}
              className="bg-[var(--text)] text-white border-none px-[18px] py-2 text-[13px] cursor-pointer"
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Project Info'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
