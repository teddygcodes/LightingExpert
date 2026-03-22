'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DeleteSubmittalButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/submittals/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  if (confirming) {
    return (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button
          onClick={handleDelete}
          disabled={loading}
          style={{ fontSize: 11, color: '#fff', background: '#d13438', border: 'none', padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}
        >
          {loading ? '…' : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{ fontSize: 11, color: '#6b6b6b', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title={`Delete "${name}"`}
      style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      ✕
    </button>
  )
}
