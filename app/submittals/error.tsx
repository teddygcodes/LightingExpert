'use client'

import { useEffect } from 'react'

export default function SubmittalsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[SubmittalsError]', error.digest ?? '', error)
  }, [error])

  return (
    <div style={{ padding: '60px 40px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Failed to load submittals</div>
      <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 20 }}>
        An error occurred while loading submittals. Please try again.
      </div>
      <button
        onClick={reset}
        style={{ background: '#d13438', color: '#fff', border: 'none', padding: '9px 20px', fontSize: 13, cursor: 'pointer' }}
      >
        Try Again
      </button>
    </div>
  )
}
