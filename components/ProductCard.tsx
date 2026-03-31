'use client'

import { useState, memo } from 'react'
import Link from 'next/link'

interface ProductCardProps {
  product: {
    id: string
    catalogNumber: string
    familyName?: string | null
    displayName: string | null
    overallConfidence: number | null
    wattage: number | null
    lumens: number | null
    cri: number | null
    manufacturer?: { name: string; slug: string }
  }
  thumbnailUrl?: string
}

function confidenceBadge(score: number | null) {
  if (!score) return { color: 'var(--text-faint)', bg: 'var(--bg)' }
  if (score >= 0.8) return { color: '#107c10', bg: '#e8f5e8' }
  if (score >= 0.5) return { color: '#9a6700', bg: '#fff3cd' }
  return { color: '#d13438', bg: '#fde7e9' }
}

const ProductCard = memo(function ProductCard({ product, thumbnailUrl }: ProductCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const confidence = product.overallConfidence
  const pct = confidence ? Math.round(confidence * 100) : 0
  const badge = confidenceBadge(confidence)

  return (
    <Link
      href={`/products/${product.id}`}
      className="product-card block bg-white border border-[var(--border)] shadow-[var(--shadow-sm)] no-underline text-inherit overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="h-[140px] bg-[var(--bg)] overflow-hidden flex items-center justify-center">
        {thumbnailUrl && !imgFailed ? (
          <img
            src={thumbnailUrl}
            alt={product.displayName || product.catalogNumber}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="opacity-25">
            <rect x="4" y="6" width="24" height="16" stroke="var(--text-muted)" strokeWidth="1.5" fill="none" />
            <circle cx="16" cy="14" r="4" stroke="var(--text-muted)" strokeWidth="1.5" fill="none" />
            <path d="M4 22l7-5 5 4 4-3 8 6" stroke="var(--text-muted)" strokeWidth="1.5" fill="none" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="px-3.5 py-3">
        <div className="flex justify-between items-start mb-1">
          <div className="font-semibold text-[13px]" style={{ fontFamily: 'var(--font-mono)' }}>
            {product.catalogNumber}
          </div>
          <div
            className="text-[11px] font-semibold px-1.5 py-0.5 shrink-0"
            style={{ color: badge.color, background: badge.bg }}
          >
            {pct}%
          </div>
        </div>

        {product.displayName && (
          <div className="text-xs text-[var(--text)] mb-0.5 leading-snug">
            {product.displayName}
          </div>
        )}

        {product.familyName && (
          <div className="text-[11px] text-[var(--text-muted)] mb-1.5">
            {product.familyName}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap items-center" style={{ marginTop: product.familyName || product.displayName ? 6 : 0 }}>
          {!!product.wattage && (
            <span className="text-[11px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>{product.wattage}W</span>
          )}
          {!!product.lumens && (
            <span className="text-[11px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>{product.lumens.toLocaleString()}lm</span>
          )}
          {!!product.cri && (
            <span className="text-[11px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>CRI {product.cri}</span>
          )}
        </div>
      </div>
    </Link>
  )
})

export default ProductCard
