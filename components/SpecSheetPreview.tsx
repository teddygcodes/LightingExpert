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
  specSheets: unknown
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
      <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '10px 12px', fontStyle: 'italic' }}>
        No spec sheet available for {catalogNumber}
      </div>
    )
  }

  if (sheets.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 1h6l3 3v9H3V1z" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        <span>{label}</span>
        <span style={{ color: 'var(--text-faint)' }}>—</span>
        <a href={productPageUrl!} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 500 }}>
          Open on manufacturer site ↗
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--surface-raised)' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        fontSize: 12,
        borderBottom: expanded ? '1px solid var(--border)' : undefined,
        flexWrap: 'wrap',
      }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, color: 'var(--accent)' }}>
          <path d="M2 1h7l3 3v8H2V1z" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M4 7h5M4 9h3" stroke="currentColor" strokeWidth="1"/>
        </svg>
        <span style={{ fontWeight: 600, flex: 1, minWidth: 0, color: 'var(--text-secondary)' }}>{label}</span>

        {sheets.length > 1 && (
          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            style={{
              fontSize: 11,
              border: '1px solid var(--border-strong)',
              padding: '2px 6px',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          >
            {sheets.map((s, i) => (
              <option key={i} value={i}>{s.label ?? `Sheet ${i + 1}`}</option>
            ))}
          </select>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            fontSize: 11,
            padding: '3px 10px',
            background: 'transparent',
            border: '1px solid var(--border-strong)',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {expanded ? (
            <>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></svg>
              Collapse
            </>
          ) : (
            <>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></svg>
              Expand
            </>
          )}
        </button>

        {activePath && (
          <a
            href={activePath}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
          >
            ↗ New tab
          </a>
        )}
      </div>

      {expanded && activePath && (
        <iframe
          src={activePath}
          style={{ width: '100%', height: 520, border: 'none', display: 'block' }}
          title={`Spec sheet for ${catalogNumber}`}
        />
      )}
    </div>
  )
}
