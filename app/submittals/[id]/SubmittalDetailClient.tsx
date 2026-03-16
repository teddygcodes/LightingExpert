'use client'

import { useState, useCallback } from 'react'
import SubmittalBuilder from '@/components/SubmittalBuilder'
import FixtureScheduleTable, { FixtureRow } from '@/components/FixtureScheduleTable'

interface Submittal {
  id: string
  projectName: string
  projectNumber: string | null
  preparedBy: string | null
  preparedFor: string | null
  revision: string | null
  notes: string | null
  status: string
  pdfUrl: string | null
  items: FixtureRow[]
}

export default function SubmittalDetailClient({ initial }: { initial: Submittal }) {
  const [submittal, setSubmittal] = useState(initial)
  const [generating, setGenerating] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [genError, setGenError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/submittals/${submittal.id}`)
    if (res.ok) {
      const data = await res.json()
      setSubmittal(data)
    }
  }, [submittal.id])

  async function generatePDF() {
    setGenerating(true)
    setGenError(null)
    setWarnings([])
    const res = await fetch(`/api/submittals/${submittal.id}/generate`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setGenError(json.error ?? 'Generation failed')
    } else {
      setWarnings(json.warnings ?? [])
      await refresh()
    }
    setGenerating(false)
  }

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, padding: '12px 16px', background: '#f9f9f9', border: '1px solid #e0e0e0' }}>
        <button
          onClick={generatePDF}
          disabled={generating || submittal.items.length === 0}
          style={{
            background: submittal.items.length === 0 ? '#ccc' : '#d13438',
            color: '#fff',
            border: 'none',
            padding: '9px 20px',
            fontSize: 13,
            fontWeight: 600,
            cursor: submittal.items.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {generating ? 'Generating PDF…' : 'Generate PDF Package'}
        </button>

        {submittal.pdfUrl && (
          <a
            href={submittal.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0078d4', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
          >
            ↓ Download Last PDF ↗
          </a>
        )}

        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          fontWeight: 600,
          padding: '3px 10px',
          background: submittal.status === 'FINAL' ? '#107c10' : '#6b6b6b',
          color: '#fff',
        }}>
          {submittal.status.replace(/_/g, ' ')}
        </span>
      </div>

      {genError && (
        <div style={{ background: '#fdf2f2', border: '1px solid #f4c2c2', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c0392b' }}>
          Error: {genError}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <strong>Warnings:</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Fixture schedule */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', fontSize: 13, fontWeight: 700 }}>
          Fixture Schedule ({submittal.items.length} {submittal.items.length === 1 ? 'type' : 'types'})
        </div>
        <FixtureScheduleTable
          submittalId={submittal.id}
          items={submittal.items}
          onItemsChange={refresh}
        />
      </div>

      {/* Builder (project info + add fixture) */}
      <SubmittalBuilder
        submittalId={submittal.id}
        initialData={{
          projectName: submittal.projectName,
          projectNumber: submittal.projectNumber,
          preparedBy: submittal.preparedBy,
          preparedFor: submittal.preparedFor,
          revision: submittal.revision,
          notes: submittal.notes,
        }}
        onRefresh={refresh}
      />
    </div>
  )
}
