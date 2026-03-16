'use client'

import { useState } from 'react'
import PdfAnnotator from '@/components/PdfAnnotator'

interface SpecSheet {
  label: string
  url: string
  path?: string
}

interface ProductDetailClientProps {
  product: Record<string, unknown>
}

export default function ProductDetailClient({ product }: ProductDetailClientProps) {
  const specSheetPath = product.specSheetPath as string | null
  const rawSheets = product.specSheets as SpecSheet[] | null | undefined
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // Build the full list of available spec sheets with local paths
  const availableSheets: SpecSheet[] = []
  if (rawSheets && Array.isArray(rawSheets) && rawSheets.length > 0) {
    for (const s of rawSheets) {
      if (s.path || s.url) availableSheets.push(s)
    }
  } else if (specSheetPath) {
    availableSheets.push({ label: 'Spec Sheet', url: '', path: specSheetPath })
  }

  // The path to show in the viewer — either explicitly chosen or auto-selected
  const viewerPath =
    selectedPath ??
    (availableSheets.length === 1 ? (availableSheets[0].path ?? null) : null)

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700 }}>
          {product.catalogNumber as string}
        </span>
        {product.displayName ? (
          <span style={{ color: '#6b6b6b', fontSize: 13 }}>
            {product.displayName as string}
          </span>
        ) : null}
      </div>

      {availableSheets.length === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13 }}>No spec sheet available.</div>
      ) : viewerPath ? (
        <>
          {/* Back button when multiple sheets exist and one is selected */}
          {availableSheets.length > 1 && (
            <button
              onClick={() => setSelectedPath(null)}
              style={{
                marginBottom: 12,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: '#6b6b6b',
                padding: 0,
              }}
            >
              ← All spec sheets
            </button>
          )}
          <PdfAnnotator pdfUrl={viewerPath} />
        </>
      ) : (
        <SpecSheetPicker sheets={availableSheets} onSelect={setSelectedPath} />
      )}
    </div>
  )
}

function SpecSheetPicker({
  sheets,
  onSelect,
}: {
  sheets: SpecSheet[]
  onSelect: (path: string) => void
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#444',
          marginBottom: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Select a spec sheet
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sheets.map((s, i) => (
          <button
            key={i}
            disabled={!s.path && !s.url}
            onClick={() => {
              if (s.path) onSelect(s.path)
              else if (s.url) window.open(s.url, '_blank', 'noopener,noreferrer')
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: 6,
              cursor: (s.path || s.url) ? 'pointer' : 'not-allowed',
              textAlign: 'left',
              fontSize: 14,
              color: '#1a1a1a',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => {
              if (s.path || s.url) (e.currentTarget as HTMLButtonElement).style.borderColor = '#888'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e0e0e0'
            }}
          >
            <span style={{ fontSize: 20 }}>📄</span>
            <span style={{ flex: 1 }}>
              {s.label}
              {!s.path && s.url && (
                <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>
                  (external link ↗)
                </span>
              )}
            </span>
            <span style={{ fontSize: 18, color: '#888' }}>{s.path ? '›' : s.url ? '↗' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
