'use client'

import { useState, useRef } from 'react'

interface ScheduleImporterProps {
  submittalId: string
  onImported: () => void
}

export default function ScheduleImporter({ submittalId, onImported }: ScheduleImporterProps) {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: string[]; unmatched: string[] } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/submittals/${submittalId}/import-schedule`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { setImportError(json.error ?? 'Import failed'); return }
      setImportResult(json)
      if (json.imported?.length) onImported()
    } catch {
      setImportError('Network error — please try again')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleImport} style={{ display: 'none' }} />
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => { setImportResult(null); fileInputRef.current?.click() }}
            disabled={importing}
            style={{
              background: importing ? '#ccc' : '#1a1a1a',
              color: '#fff', border: 'none', padding: '8px 18px',
              fontSize: 13, fontWeight: 600,
              cursor: importing ? 'not-allowed' : 'pointer',
            }}
          >
            {importing ? 'Reading fixture schedule…' : '↑ Import from Schedule'}
          </button>
          <span style={{ fontSize: 12, color: '#6b6b6b' }}>Upload a screenshot or PDF of a fixture schedule to auto-populate</span>
        </div>
        {importResult && (
          <div style={{ marginTop: 10, fontSize: 12 }}>
            {importResult.imported.length > 0 && (
              <div style={{ color: '#107c10', fontWeight: 600 }}>
                ✓ Imported {importResult.imported.length} fixture{importResult.imported.length !== 1 ? 's' : ''}
              </div>
            )}
            {importResult.unmatched.length > 0 && (
              <div style={{ color: '#ff8c00', marginTop: 4 }}>
                ⚠ {importResult.unmatched.length} not found in database — add manually: {importResult.unmatched.join(', ')}
              </div>
            )}
            {importResult.imported.length === 0 && importResult.unmatched.length === 0 && (
              <div style={{ color: '#6b6b6b' }}>No fixture entries found in the uploaded document.</div>
            )}
          </div>
        )}
        {importError && (
          <p style={{ color: '#c00', fontSize: 12, marginTop: 4 }}>{importError}</p>
        )}
      </div>
    </>
  )
}
