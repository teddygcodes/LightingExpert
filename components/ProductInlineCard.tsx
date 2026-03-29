'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { ProductSearchResult } from '@/lib/agent/types'
import SpecSheetPreview from './SpecSheetPreview'

const AddToSubmittalDialog = dynamic(() => import('./AddToSubmittalDialog'), { ssr: false })

interface Props {
  product: ProductSearchResult
  onAddToSubmittal?: (catalogNumber: string) => void
}

export default function ProductInlineCard({ product, onAddToSubmittal }: Props) {
  const [showSpec, setShowSpec] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [addedMsg, setAddedMsg] = useState<string | null>(null)

  const lumensDisplay =
    product.lumens != null
      ? `${product.lumens.toLocaleString()} lm`
      : product.lumensMin != null && product.lumensMax != null
      ? `${product.lumensMin.toLocaleString()}–${product.lumensMax.toLocaleString()} lm`
      : null

  const wattageDisplay =
    product.wattage != null && product.wattage > 0
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
    <>
    <div
      className="product-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        marginBottom: 6,
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
        {/* Thumbnail */}
        <div style={{
          width: 72,
          height: 72,
          flexShrink: 0,
          background: 'var(--bg)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={product.catalogNumber}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ opacity: 0.2 }}>
              <rect x="3" y="6" width="14" height="8" stroke="#666" strokeWidth="1.5"/>
              <path d="M7 6V4h6v2" stroke="#666" strokeWidth="1.5"/>
            </svg>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.02em', color: 'var(--text)' }}>
              {product.catalogNumber}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {product.manufacturer?.name}
            </span>
          </div>

          {product.displayName && (
            <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product.displayName}
            </div>
          )}

          {/* Specs row */}
          <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            {lumensDisplay && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{lumensDisplay}</span>
            )}
            {wattageDisplay && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{wattageDisplay}</span>
            )}
            {product.cri != null && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>CRI {product.cri}</span>
            )}
            {cctDisplay && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cctDisplay}</span>
            )}
            {product.voltage && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {product.voltage.replace(/_/g, '/').replace(/^V/, '')}V
              </span>
            )}
          </div>

          {/* Badges row */}
          <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {product.dlcPremium && (
              <span style={{ background: '#e6f4ea', color: '#2d7a3c', fontSize: 10, padding: '2px 7px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                DLC Premium
              </span>
            )}
            {product.dlcListed && !product.dlcPremium && (
              <span style={{ background: '#e6f4ea', color: '#2d7a3c', fontSize: 10, padding: '2px 7px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                DLC
              </span>
            )}
            {product.wetLocation && (
              <span style={{ background: '#eef2ff', color: '#3730a3', fontSize: 10, padding: '2px 7px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Wet Loc
              </span>
            )}
          </div>

          {/* Added confirmation */}
          {addedMsg && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 8, fontSize: 12,
              color: '#15803d', background: '#f0fdf4',
              border: '1px solid #bbf7d0', borderLeft: '3px solid #15803d',
              padding: '4px 10px',
            }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 5.5l2.5 2.5L9.5 2" stroke="#15803d" strokeWidth="1.8" strokeLinecap="square"/>
              </svg>
              {addedMsg}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => setShowSpec(!showSpec)}
              style={{
                fontSize: 12,
                padding: '4px 11px',
                background: 'transparent',
                border: '1px solid var(--border-strong)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontWeight: 500,
                transition: 'border-color 0.12s',
              }}
            >
              {showSpec ? 'Hide Spec' : 'Spec Sheet'}
            </button>
            {onAddToSubmittal && (
              <button
                onClick={() => setShowDialog(true)}
                style={{
                  fontSize: 12,
                  padding: '4px 11px',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                + Submittal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline spec sheet */}
      {showSpec && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
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

    {/* Add-to-submittal dialog — portalled to document.body to escape transforms */}
    {showDialog && (
      <AddToSubmittalDialog
        product={product}
        onClose={() => setShowDialog(false)}
        onAdded={(name) => {
          setShowDialog(false)
          setAddedMsg(`Added to ${name}`)
          setTimeout(() => setAddedMsg(null), 4000)
        }}
      />
    )}
  </>
  )
}
