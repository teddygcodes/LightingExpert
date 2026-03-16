'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{ padding: '60px 40px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
      <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
        {error.message || 'An unexpected error occurred.'}
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
