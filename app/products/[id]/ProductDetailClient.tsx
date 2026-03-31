'use client'

import { useState } from 'react'
import SpecSection from '@/components/SpecSection'
import SpecBadge, { type BadgeVariant } from '@/components/SpecBadge'
import PdfAnnotator from '@/components/PdfAnnotator'

interface ProductDetailClientProps {
  product: Record<string, unknown>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRange(
  nom: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  unit: string,
): string | null {
  if (min != null && max != null && min !== max) {
    return `${min.toLocaleString()}–${max.toLocaleString()} ${unit}`
  }
  const val = nom ?? min ?? max
  if (val != null) return `${val.toLocaleString()} ${unit}`
  return null
}

function formatCct(cctOptions: number[] | undefined): string | null {
  if (!cctOptions || cctOptions.length === 0) return null
  return cctOptions.map(c => `${c}K`).join(' / ')
}

function formatDimming(dimmingType: string[] | undefined, dimmable: boolean | null | undefined): string | null {
  if (dimmingType && dimmingType.length > 0) {
    const displayMap: Record<string, string> = {
      V0_10: '0-10V', DALI: 'DALI', TRIAC: 'Triac', PHASE: 'Phase Cut',
      LUTRON: 'Lutron', ELV: 'ELV', NLIGHT: 'nLight',
    }
    return dimmingType.map(d => displayMap[d] ?? d).join(', ')
  }
  if (dimmable === true) return 'Yes (protocol unknown)'
  if (dimmable === false) return 'No'
  return null
}

function formatMounting(mountingType: string[] | undefined): string | null {
  if (!mountingType || mountingType.length === 0) return null
  const displayMap: Record<string, string> = {
    RECESSED: 'Recessed', SURFACE: 'Surface', PENDANT: 'Pendant',
    CHAIN: 'Chain', POLE: 'Pole', WALL: 'Wall', GROUND: 'Ground',
    TRACK: 'Track', STEM: 'Stem', CABLE: 'Cable', GRID_TBAR: 'Grid/T-Bar',
  }
  return mountingType.map(m => displayMap[m] ?? m).join(', ')
}

function statusBadgeVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case 'SUCCESS': return 'status-success'
    case 'PARTIAL': return 'status-partial'
    case 'FAILED': return 'status-failed'
    case 'SUSPICIOUS': return 'status-suspicious'
    default: return 'status-partial'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductDetailClient({ product }: ProductDetailClientProps) {
  const [specExpanded, setSpecExpanded] = useState(false)
  const [addingToSubmittal, setAddingToSubmittal] = useState(false)
  const [submittalMsg, setSubmittalMsg] = useState<string | null>(null)

  // Cast to typed accessors
  const get = <T,>(key: string): T | null => (product[key] ?? null) as T | null
  const getArr = <T,>(key: string): T[] => (Array.isArray(product[key]) ? product[key] as T[] : [])

  const catalogNumber = get<string>('catalogNumber') ?? ''
  const manufacturerName = (product.manufacturer as Record<string, string> | null)?.name ?? ''
  const manufacturerSlug = (product.manufacturer as Record<string, string> | null)?.slug ?? ''
  const familyName = get<string>('familyName')
  const displayName = get<string>('displayName')
  const description = get<string>('description')
  const canonicalFixtureType = get<string>('canonicalFixtureType')
  const thumbnailPath = get<string>('thumbnailPath')

  // Electrical
  const wattage = get<number>('wattage')
  const wattageMin = get<number>('wattageMin')
  const wattageMax = get<number>('wattageMax')
  const voltage = get<string>('voltage')
  const dimmable = get<boolean>('dimmable')
  const dimmingType = getArr<string>('dimmingType')

  // Light output
  const lumens = get<number>('lumens')
  const lumensMin = get<number>('lumensMin')
  const lumensMax = get<number>('lumensMax')
  const efficacy = get<number>('efficacy')
  const cri = get<number>('cri')
  const cctOptions = getArr<number>('cctOptions')
  const beamAngle = get<number>('beamAngle')

  // Physical
  const formFactor = get<string>('formFactor')
  const dimensions = get<string>('dimensions')
  const weight = get<number>('weight')
  const mountingType = getArr<string>('mountingType')
  const ipRating = get<string>('ipRating')
  const nemaRating = get<string>('nemaRating')
  const opticalDistribution = getArr<string>('opticalDistribution')

  // Certifications
  const wetLocation = get<boolean>('wetLocation')
  const dampLocation = get<boolean>('dampLocation')
  const ulListed = get<boolean>('ulListed')
  const dlcListed = get<boolean>('dlcListed')
  const dlcPremium = get<boolean>('dlcPremium')
  const energyStar = get<boolean>('energyStar')

  // Applications
  const applications = getArr<string>('applications')

  // Spec sheets
  const specSheetPath = get<string>('specSheetPath')
  type Sheet = { label: string; url: string; path?: string }
  const rawSheets = Array.isArray(product.specSheets) ? product.specSheets as Sheet[] : []
  const sheets: Sheet[] = rawSheets.length > 0
    ? rawSheets.filter(s => s.path || s.url)
    : specSheetPath ? [{ label: 'Spec Sheet', url: '', path: specSheetPath }] : []
  const primarySheet = sheets[0] ?? null
  // Prefer locally cached specSheetPath for the annotator; fall back to sheet path from array
  const viewerPath = specSheetPath ?? primarySheet?.path ?? null

  // Extraction
  const specExtractedAt = get<string>('specExtractedAt')
  const extractionStatus = get<string>('specExtractionStatus')
  const promotionSummary = product.specPromotionSummaryJson as Record<string, unknown> | null
  const promotedCount = typeof promotionSummary?.fieldsPromotedCount === 'number' ? promotionSummary.fieldsPromotedCount : null
  const totalFields = typeof promotionSummary?.fieldsTotalCount === 'number' ? promotionSummary.fieldsTotalCount : null
  const skippedFields = Array.isArray(promotionSummary?.skippedFields) ? promotionSummary!.skippedFields as string[] : []

  const hasExtraction = !!specExtractedAt

  // Voltage display
  const voltageDisplay: Record<string, string> = {
    V120: '120V', V277: '277V', V120_277: '120–277V', V347: '347V',
    V347_480: '347–480V', V120_347: '120–347V', UNIVERSAL: 'Universal',
  }

  // ── Add to Submittal ──
  async function handleAddToSubmittal() {
    setAddingToSubmittal(true)
    setSubmittalMsg(null)
    try {
      const res = await fetch('/api/submittals')
      const json = (await res.json()) as Array<Record<string, unknown>>
      const drafts = json.filter(s => s.status === 'DRAFT')
      if (drafts.length === 0) {
        window.location.href = '/submittals/new'
        return
      }
      const latestDraft = drafts[0]
      const updateRes = await fetch(`/api/submittals/${latestDraft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_item', catalogNumber }),
      })
      if (updateRes.ok) {
        setSubmittalMsg(`Added to "${latestDraft.projectName}"`)
      } else {
        setSubmittalMsg('Failed to add — try from Submittals page')
      }
    } catch {
      setSubmittalMsg('Error — please try again')
    } finally {
      setAddingToSubmittal(false)
    }
  }

  // ── Spec data from main fields (shown regardless of extraction source) ──
  const lumensStr = formatRange(lumens, lumensMin, lumensMax, 'lm')
  const wattageStr = formatRange(wattage, wattageMin, wattageMax, 'W')
  const dimmingStr = formatDimming(dimmingType, dimmable)
  const mountingStr = formatMounting(mountingType)
  const voltageStr = voltage ? (voltageDisplay[voltage] ?? voltage) : null

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
        {thumbnailPath && (
          <img
            src={thumbnailPath}
            alt={catalogNumber}
            style={{
              width: 100, height: 100, objectFit: 'contain',
              borderRadius: 6, border: '1px solid #e8e8e8', flexShrink: 0,
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {catalogNumber}
            </span>
            <span style={{ fontSize: 13, color: '#888' }}>
              {manufacturerName}
            </span>
          </div>

          {(displayName || familyName) && (
            <div style={{ fontSize: 14, color: '#444', marginBottom: 8 }}>
              {displayName ?? familyName}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {canonicalFixtureType && (
              <SpecBadge
                label={canonicalFixtureType.replace(/_/g, ' ')}
                variant={canonicalFixtureType === 'CONTROLS' ? 'controls' : 'fixture'}
              />
            )}
            {dlcPremium && <SpecBadge label="DLC Premium" variant="dlc-premium" />}
            {!dlcPremium && dlcListed && <SpecBadge label="DLC Listed" variant="dlc" />}
            {wetLocation && <SpecBadge label="Wet Location" variant="wet" />}
            {energyStar && <SpecBadge label="Energy Star" variant="energy-star" />}
          </div>
        </div>
      </div>

      {/* ── Spec sections ── */}
      {!hasExtraction && !lumensStr && !wattageStr ? (
        <div
          style={{
            padding: '14px 18px', background: '#fafafa', border: '1px solid #e8e8e8',
            borderRadius: 6, fontSize: 13, color: '#888', marginBottom: 20,
          }}
        >
          Spec data not yet extracted from PDF.
          {sheets.length > 0 && <span> View the spec sheet below for full specifications.</span>}
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <SpecSection
              title="Performance"
              rows={[
                { label: 'Lumens', value: lumensStr },
                { label: 'Wattage', value: wattageStr },
                { label: 'Efficacy', value: efficacy != null ? `${efficacy} LPW` : null },
                { label: 'CRI', value: cri != null ? `${cri}+` : null },
                { label: 'CCT', value: formatCct(cctOptions) },
                { label: 'Beam Angle', value: beamAngle != null ? `${beamAngle}°` : null },
              ]}
            />
            <SpecSection
              title="Electrical"
              rows={[
                { label: 'Voltage', value: voltageStr },
                { label: 'Dimming', value: dimmingStr },
              ]}
            />
            <SpecSection
              title="Physical"
              rows={[
                { label: 'Dimensions', value: dimensions },
                { label: 'Weight', value: weight != null ? `${weight} lbs` : null },
                { label: 'Mounting', value: mountingStr },
                { label: 'Distribution', value: opticalDistribution.length > 0 ? opticalDistribution.join(', ') : null },
                { label: 'Form Factor', value: formFactor },
                { label: 'IP Rating', value: ipRating },
                { label: 'NEMA', value: nemaRating },
              ]}
            />
            <SpecSection
              title="Certifications"
              rows={[
                { label: 'UL Listed', value: ulListed },
                { label: 'DLC', value: dlcPremium ? 'Premium' : dlcListed ? 'Listed' : null },
                { label: 'Wet Location', value: wetLocation ? `Yes${ipRating ? ` (${ipRating})` : ''}` : null },
                { label: 'Damp Location', value: dampLocation },
                { label: 'Energy Star', value: energyStar },
              ]}
            />
          </div>

          {/* Applications */}
          {applications.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: '#999', marginBottom: 6,
                }}
              >
                Applications
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {applications.map((app, i) => (
                  <span
                    key={i}
                    style={{
                      background: '#f2f2f2', color: '#444', borderRadius: 4,
                      padding: '3px 10px', fontSize: 12, fontWeight: 500,
                      textTransform: 'capitalize',
                    }}
                  >
                    {app}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {description && (
            <div
              style={{
                background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6,
                padding: '12px 16px', fontSize: 13, color: '#444', lineHeight: 1.6,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: '#999', marginBottom: 6,
                }}
              >
                Description
              </div>
              {description}
            </div>
          )}
        </>
      )}

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        {sheets.length > 0 && (
          <button
            onClick={() => setSpecExpanded(true)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              background: '#fff', border: '1px solid #d0d0d0', borderRadius: 4,
              cursor: 'pointer', color: '#1a1a1a',
            }}
          >
            Spec Sheet
          </button>
        )}
        <button
          onClick={handleAddToSubmittal}
          disabled={addingToSubmittal}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: '#d13438', border: 'none', borderRadius: 4,
            cursor: addingToSubmittal ? 'not-allowed' : 'pointer',
            color: '#fff', opacity: addingToSubmittal ? 0.7 : 1,
          }}
        >
          {addingToSubmittal ? 'Adding…' : '+ Add to Submittal'}
        </button>
        {submittalMsg && (
          <span style={{ fontSize: 13, color: '#555' }}>{submittalMsg}</span>
        )}
      </div>

      {/* ── Spec sheet modal overlay ── */}
      {specExpanded && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSpecExpanded(false) }}
        >
          <div
            style={{
              position: 'relative', flex: 1, margin: '32px',
              background: '#fff', borderRadius: 8, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderBottom: '1px solid #e8e8e8', flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                {catalogNumber} — Spec Sheet
              </span>
              <button
                onClick={() => setSpecExpanded(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 20, color: '#888', lineHeight: 1, padding: '0 4px',
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Annotator or fallback */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {viewerPath
                ? <PdfAnnotator pdfUrl={viewerPath} />
                : primarySheet?.url
                  ? (
                    <div style={{ padding: 24 }}>
                      <a href={primarySheet.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 13, color: '#d13438' }}>
                        Open spec sheet ↗
                      </a>
                    </div>
                  )
                  : <div style={{ padding: 24, color: '#888', fontSize: 13 }}>No spec sheet available.</div>
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Extraction provenance (visually secondary) ── */}
      {hasExtraction && (
        <div
          style={{
            borderTop: '1px solid #f0f0f0', paddingTop: 12,
            fontSize: 12, color: '#bbb', lineHeight: 1.6,
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 3 }}>
            <span>
              Extracted {specExtractedAt
                ? new Date(specExtractedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : ''}
            </span>
            {extractionStatus && (
              <SpecBadge label={extractionStatus} variant={statusBadgeVariant(extractionStatus)} />
            )}
            {promotedCount != null && totalFields != null && (
              <span>{promotedCount}/{totalFields} fields promoted</span>
            )}
          </div>
          {skippedFields.length > 0 && (
            <div>
              Skipped: {skippedFields.slice(0, 5).join(', ')}
              {skippedFields.length > 5 && ` +${skippedFields.length - 5} more`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
