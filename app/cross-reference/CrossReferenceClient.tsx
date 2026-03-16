'use client'

import { useState } from 'react'
import { MatchCard, RejectCard } from '@/components/CrossReferenceResult'
import type { CrossRefMatch, CrossRefReject } from '@/lib/types'

interface ApiResult {
  source: {
    id: string
    catalogNumber: string
    displayName: string | null
    category: string | null
    wattage: number | null
    lumens: number | null
    cri: number | null
    manufacturer: { name: string; slug: string }
  }
  matches: CrossRefMatch[]
  rejects: CrossRefReject[]
  meta: { totalCandidates: number; hardRejected: number; matched: number }
}

export default function CrossReferenceClient() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRejects, setShowRejects] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/cross-reference?catalogNumber=${encodeURIComponent(input.trim())}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Search failed')
        return
      }
      setResult(data)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Search form */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter catalog number (e.g. HH4-LED-ML-CCT)"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #ccc',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 20px',
            background: '#d13438',
            border: 'none',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Searching...' : 'Find Equivalents'}
        </button>
      </form>

      {/* Note about v1 scope */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        padding: '8px 14px',
        fontSize: 12,
        color: '#6b6b6b',
        marginBottom: 20,
      }}>
        <strong>v1 scope:</strong> Cross-referencing within Elite Lighting catalog only.
        Cross-manufacturer comparison (Acuity, Cooper) coming in v2.
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #d13438', padding: '10px 14px', fontSize: 13, color: '#d13438', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div>
          {/* Source product card */}
          <div style={{ background: '#fff', border: '1px solid #0078d4', padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#0078d4', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
              Source Fixture
            </div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16 }}>{result.source.catalogNumber}</div>
            {result.source.displayName && (
              <div style={{ fontSize: 13, color: '#6b6b6b', marginTop: 2 }}>{result.source.displayName}</div>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#6b6b6b', flexWrap: 'wrap' }}>
              {result.source.wattage && <span>{result.source.wattage}W</span>}
              {result.source.lumens && <span>{result.source.lumens.toLocaleString()} lm</span>}
              {result.source.cri && <span>CRI {result.source.cri}</span>}
            </div>
          </div>

          {/* Match stats */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 }}>
            <span style={{ color: '#107c10', fontWeight: 600 }}>{result.meta.matched} matches</span>
            <span style={{ color: '#d13438' }}>{result.meta.hardRejected} hard rejected</span>
          </div>

          {/* Matches */}
          {result.matches.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: 32, textAlign: 'center', color: '#6b6b6b', fontSize: 13 }}>
              No matching fixtures found in the current catalog.
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {result.matches.map((m) => (
                <MatchCard key={m.productId} match={m} />
              ))}
            </div>
          )}

          {/* Hard rejects (collapsible) */}
          {result.rejects.length > 0 && (
            <div>
              <button
                onClick={() => setShowRejects(!showRejects)}
                style={{
                  background: 'none',
                  border: '1px solid #ccc',
                  padding: '5px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: '#6b6b6b',
                  marginBottom: 8,
                }}
              >
                {showRejects ? '▲' : '▼'} {result.rejects.length} hard-rejected fixtures
              </button>
              {showRejects && result.rejects.map((r) => (
                <RejectCard key={r.productId} reject={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
