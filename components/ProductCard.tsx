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

function confidenceColor(score: number | null): string {
  if (!score) return '#999'
  if (score >= 0.8) return '#107c10'
  if (score >= 0.5) return '#f7a600'
  return '#d13438'
}

const ProductCard = memo(function ProductCard({ product, thumbnailUrl }: ProductCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const confidence = product.overallConfidence
  const pct = confidence ? Math.round(confidence * 100) : 0

  return (
    <Link
      href={`/products/${product.id}`}
      style={{
        display: 'block',
        background: '#fff',
        border: '1px solid #e0e0e0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        textDecoration: 'none',
        color: 'inherit',
        overflow: 'hidden',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        height: 140,
        background: '#f0f0f0',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {thumbnailUrl && !imgFailed ? (
          <img
            src={thumbnailUrl}
            alt={product.displayName || product.catalogNumber}
            onError={() => setImgFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
          />
        ) : (
          <span style={{ color: '#ccc', fontSize: 11 }}>No image</span>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 13, fontFamily: 'monospace' }}>
            {product.catalogNumber}
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: confidenceColor(confidence),
            background: '#f3f3f3',
            padding: '2px 6px',
            flexShrink: 0,
          }}>
            {pct}%
          </div>
        </div>

        {product.displayName && (
          <div style={{ fontSize: 12, color: '#1a1a1a', marginBottom: 2, lineHeight: 1.4 }}>
            {product.displayName}
          </div>
        )}

        {product.familyName && (
          <div style={{ fontSize: 11, color: '#6b6b6b', marginBottom: 6 }}>
            {product.familyName}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: product.familyName || product.displayName ? 6 : 0 }}>
          {!!product.wattage && (
            <span style={{ fontSize: 11, color: '#6b6b6b' }}>{product.wattage}W</span>
          )}
          {!!product.lumens && (
            <span style={{ fontSize: 11, color: '#6b6b6b' }}>{product.lumens.toLocaleString()}lm</span>
          )}
          {!!product.cri && (
            <span style={{ fontSize: 11, color: '#6b6b6b' }}>CRI {product.cri}</span>
          )}
        </div>
      </div>
    </Link>
  )
})

export default ProductCard
