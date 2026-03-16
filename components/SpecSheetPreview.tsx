'use client'

import { useState } from 'react'

interface SpecSheet {
  path?: string
  label?: string
  url?: string
}

interface Props {
  catalogNumber: string
  displayName: string | null
  specSheetPath: string | null
  specSheets: unknown      // JSON: SpecSheet[] | null from DB
  productPageUrl: string | null
}

export default function SpecSheetPreview({
  catalogNumber,
  displayName,
  specSheetPath,
  specSheets,
  productPageUrl,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)

  // Normalise specSheets array
  const sheets: SpecSheet[] = Array.isArray(specSheets)
    ? (specSheets as SpecSheet[])
    : specSheetPath
    ? [{ path: specSheetPath, label: 'Spec Sheet' }]
    : []

  const activeSheet = sheets[selectedIdx]
  const activePath = activeSheet?.path ?? specSheetPath
  const label = displayName ?? catalogNumber

  if (sheets.length === 0 && !productPageUrl) {
    return (
      <div style={{ color: '#999', fontSize: 12, padding: '6px 0' }}>
        No spec sheet available for {catalogNumber}
      </div>
    )
  }

  if (sheets.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#6b6b6b' }}>
        📄 {label} —{' '}
        <a
          href={productPageUrl!}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#d13438' }}
        >
          Open on manufacturer site ↗
        </a>
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #e0e0e0', background: '#fafafa' }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          fontSize: 12,
          borderBottom: expanded ? '1px solid #e0e0e0' : undefined,
          flexWrap: 'wrap',
        }}
      >
        <span>📄</span>
        <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>Spec Sheet: {label}</span>

        {sheets.length > 1 && (
          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            style={{
              fontSize: 11,
              border: '1px solid #ccc',
              padding: '2px 4px',
              background: '#fff',
            }}
          >
            {sheets.map((s, i) => (
              <option key={i} value={i}>
                {s.label ?? `Sheet ${i + 1}`}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            background: 'transparent',
            border: '1px solid #ccc',
            cursor: 'pointer',
          }}
        >
          {expanded ? '▲ Collapse' : '▼ Expand'}
        </button>

        {activePath && (
          <a
            href={activePath}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: '#d13438', textDecoration: 'none' }}
          >
            ↗ New tab
          </a>
        )}
      </div>

      {/* PDF iframe — only rendered when expanded (lazy load) */}
      {expanded && activePath && (
        <iframe
          src={activePath}
          style={{ width: '100%', height: 500, border: 'none', display: 'block' }}
          title={`Spec sheet for ${catalogNumber}`}
        />
      )}
    </div>
  )
}
