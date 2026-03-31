'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error.digest ?? '', error)
  }, [error])

  return (
    <div style={{ padding: '60px 40px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
        An unexpected error occurred. Please try again.
      </div>
      {error.digest && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16, fontFamily: 'var(--font-mono)' }}>
          Error ID: {error.digest}
        </div>
      )}
      <button
        onClick={reset}
        style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '9px 20px', fontSize: 13, cursor: 'pointer' }}
      >
        Try Again
      </button>
    </div>
  )
}
