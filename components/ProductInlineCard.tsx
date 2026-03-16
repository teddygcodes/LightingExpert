'use client'

import { useState } from 'react'
import type { ProductSearchResult } from '@/lib/agent/types'
import SpecSheetPreview from './SpecSheetPreview'

interface Props {
  product: ProductSearchResult
  onAddToSubmittal?: (catalogNumber: string) => void
}

export default function ProductInlineCard({ product, onAddToSubmittal }: Props) {
  const [showSpec, setShowSpec] = useState(false)

  const lumensDisplay =
    product.lumens != null
      ? `${product.lumens.toLocaleString()} lm`
      : product.lumensMin != null && product.lumensMax != null
      ? `${product.lumensMin.toLocaleString()}–${product.lumensMax.toLocaleString()} lm`
      : null

  const wattageDisplay =
    product.wattage != null
      ? `${product.wattage}W`
      : product.wattageMin != null && product.wattageMax != null
      ? `${product.wattageMin}–${product.wattageMax}W`
      : null

  const cctDisplay =
    product.cctOptions?.length > 0
      ? product.cctOptions.map((c) => `${c}K`).join('/')
      : null

  const thumbnailUrl =
    product.manufacturer?.slug && product.catalogNumber
      ? `/thumbnails/${product.manufacturer.slug}/${encodeURIComponent(product.catalogNumber)}.png`
      : null

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        marginBottom: 8,
        padding: '10px 12px',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Thumbnail */}
        <div
          style={{
            width: 80,
            height: 80,
            flexShrink: 0,
            background: '#f5f5f5',
            border: '1px solid #e8e8e8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={product.catalogNumber}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <span style={{ color: '#bbb', fontSize: 11 }}>No img</span>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>
              {product.catalogNumber}
            </span>
            <span style={{ color: '#6b6b6b', fontSize: 12 }}>
              {product.manufacturer?.name}
            </span>
          </div>

          {product.displayName && (
            <div
              style={{
                color: '#444',
                marginTop: 2,
                fontSize: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {product.displayName}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 4,
              color: '#555',
              fontSize: 12,
              flexWrap: 'wrap',
            }}
          >
            {lumensDisplay && <span>{lumensDisplay}</span>}
            {wattageDisplay && <span>{wattageDisplay}</span>}
            {product.cri != null && <span>CRI {product.cri}</span>}
            {cctDisplay && <span>{cctDisplay}</span>}
            {product.voltage && (
              <span>{product.voltage.replace(/_/g, '/').replace(/^V/, '')}V</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {product.dlcPremium && (
              <span
                style={{
                  background: '#e6f4ea',
                  color: '#2d7a3c',
                  fontSize: 11,
                  padding: '1px 6px',
                  fontWeight: 600,
                }}
              >
                DLC Premium
              </span>
            )}
            {product.dlcListed && !product.dlcPremium && (
              <span
                style={{
                  background: '#e6f4ea',
                  color: '#2d7a3c',
                  fontSize: 11,
                  padding: '1px 6px',
                  fontWeight: 600,
                }}
              >
                DLC
              </span>
            )}
            {product.wetLocation && (
              <span
                style={{
                  background: '#e8f0fe',
                  color: '#1a4a9c',
                  fontSize: 11,
                  padding: '1px 6px',
                  fontWeight: 600,
                }}
              >
                Wet Location
              </span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setShowSpec(!showSpec)}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                background: 'transparent',
                border: '1px solid #ccc',
                cursor: 'pointer',
                color: '#1a1a1a',
              }}
            >
              {showSpec ? 'Hide Spec Sheet' : 'View Spec Sheet'}
            </button>
            {onAddToSubmittal && (
              <button
                onClick={() => onAddToSubmittal(product.catalogNumber)}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  background: '#d13438',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Add to Submittal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline spec sheet */}
      {showSpec && (
        <div style={{ marginTop: 10 }}>
          <SpecSheetPreview
            catalogNumber={product.catalogNumber}
            displayName={product.displayName}
            specSheetPath={product.specSheetPath}
            specSheets={product.specSheets}
            productPageUrl={product.productPageUrl}
          />
        </div>
      )}
    </div>
  )
}
