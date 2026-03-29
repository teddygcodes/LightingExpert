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
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleImport} className="hidden" />
      <div className="bg-[var(--surface)] border border-[var(--border)] px-4 py-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { setImportResult(null); fileInputRef.current?.click() }}
            disabled={importing}
            className={`text-white border-none px-[18px] py-2 text-[13px] font-semibold ${
              importing
                ? 'bg-[var(--border-strong)] cursor-not-allowed'
                : 'bg-[var(--text)] cursor-pointer'
            }`}
          >
            {importing ? 'Reading fixture schedule…' : '↑ Import from Schedule'}
          </button>
          <span className="text-xs text-[var(--text-muted)]">Upload a screenshot or PDF of a fixture schedule to auto-populate</span>
        </div>
        {importResult && (
          <div className="mt-2.5 text-xs">
            {importResult.imported.length > 0 && (
              <div className="text-[#107c10] font-semibold">
                ✓ Imported {importResult.imported.length} fixture{importResult.imported.length !== 1 ? 's' : ''}
              </div>
            )}
            {importResult.unmatched.length > 0 && (
              <div className="text-[#ff8c00] mt-1">
                ⚠ {importResult.unmatched.length} not found in database — add manually: {importResult.unmatched.join(', ')}
              </div>
            )}
            {importResult.imported.length === 0 && importResult.unmatched.length === 0 && (
              <div className="text-[var(--text-muted)]">No fixture entries found in the uploaded document.</div>
            )}
          </div>
        )}
        {importError && (
          <p className="text-[#c00] text-xs mt-1">{importError}</p>
        )}
      </div>
    </>
  )
}
