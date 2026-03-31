'use client'

import { useState } from 'react'
import type { FieldProvenanceMap } from '@/lib/types'

interface ProductEditorProps {
  product: Record<string, unknown>
  onSave: (updates: Record<string, unknown>) => Promise<void>
}

function ProvenanceBadge({ field, provenance }: { field: string; provenance: FieldProvenanceMap }) {
  const p = provenance[field]
  if (!p) return <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ccc', display: 'inline-block', marginLeft: 4, verticalAlign: 'middle' }} />

  const colors = {
    REGEX: '#107c10',
    AI_FALLBACK: '#f7a600',
    MANUAL: '#0078d4',
    EMPTY: '#aaa',
  }
  const color = colors[p.source] || '#aaa'

  return (
    <span
      title={`${p.source} (${Math.round(p.confidence * 100)}%)`}
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        marginLeft: 4,
        verticalAlign: 'middle',
        cursor: 'help',
      }}
    />
  )
}

function Field({
  label,
  field,
  value,
  provenance,
  onChange,
  type = 'text',
  isUnmapped,
}: {
  label: string
  field: string
  value: unknown
  provenance: FieldProvenanceMap
  onChange: (field: string, value: unknown) => void
  type?: string
  isUnmapped?: boolean
}) {
  const strVal = value === null || value === undefined ? '' : String(value)

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'block',
        fontSize: 11,
        color: '#6b6b6b',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 3,
      }}>
        {label}
        <ProvenanceBadge field={field} provenance={provenance} />
      </label>
      <input
        type={type}
        value={strVal}
        onChange={(e) => onChange(field, e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: `1px solid ${isUnmapped ? '#f7a600' : '#ccc'}`,
          fontSize: 13,
          background: isUnmapped ? '#fffbf0' : '#fff',
          outline: 'none',
        }}
      />
    </div>
  )
}

export default function ProductEditor({ product, onSave }: ProductEditorProps) {
  const provenance = (product.fieldProvenance as FieldProvenanceMap) || {}
  const [values, setValues] = useState<Record<string, unknown>>({ ...product })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function handleChange(field: string, value: unknown) {
    setValues((v) => ({ ...v, [field]: value }))
    setSaved(false)
  }

  function isUnmapped(field: string): boolean {
    const p = provenance[field]
    return !!p && p.confidence < 0.3
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updates: Record<string, unknown> = {}
      const editFields = [
        'wattage','wattageMin','wattageMax','lumens','lumensMin','lumensMax',
        'cri','voltage','dimmable','dlcListed','dlcPremium','ulListed',
        'wetLocation','dampLocation','efficacy','beamAngle','dimensions',
        'formFactor','ipRating','nemaRating','emergencyBackup','displayName',
        'familyName','description',
      ]
      for (const f of editFields) {
        const orig = product[f]
        const curr = values[f]
        if (curr !== orig) updates[f] = curr === '' ? null : curr
      }
      if (Object.keys(updates).length > 0) {
        await onSave(updates)
        setSaved(true)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkVerified() {
    setSaving(true)
    try {
      await onSave({ markVerified: true, verifiedBy: 'Admin' })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const confidence = product.overallConfidence as number | null
  const pct = confidence ? Math.round(confidence * 100) : 0
  const confColor = pct >= 80 ? '#107c10' : pct >= 50 ? '#f7a600' : '#d13438'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: confColor, fontWeight: 600 }}>
          Overall confidence: {pct}%
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleMarkVerified}
            disabled={saving}
            style={{
              padding: '7px 14px',
              border: '1px solid #0078d4',
              background: '#fff',
              color: '#0078d4',
              fontSize: 13,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            Mark Verified
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '7px 16px',
              background: '#d13438',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        {/* Identity */}
        <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid #e0e0e0', paddingBottom: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identity</span>
        </div>
        <Field label="Catalog Number" field="catalogNumber" value={values.catalogNumber} provenance={provenance} onChange={handleChange} />
        <Field label="Display Name" field="displayName" value={values.displayName} provenance={provenance} onChange={handleChange} />
        <Field label="Family Name" field="familyName" value={values.familyName} provenance={provenance} onChange={handleChange} />
        <Field label="Description" field="description" value={values.description} provenance={provenance} onChange={handleChange} />

        {/* Electrical */}
        <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid #e0e0e0', paddingBottom: 4, marginBottom: 12, marginTop: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Electrical</span>
        </div>
        <Field label="Wattage (W)" field="wattage" value={values.wattage === 0 ? null : values.wattage} provenance={provenance} onChange={handleChange} type="number" isUnmapped={isUnmapped('wattage')} />
        <Field label="Voltage" field="voltage" value={values.voltage} provenance={provenance} onChange={handleChange} isUnmapped={isUnmapped('voltage')} />
        <Field label="Wattage Min" field="wattageMin" value={values.wattageMin} provenance={provenance} onChange={handleChange} type="number" />
        <Field label="Wattage Max" field="wattageMax" value={values.wattageMax} provenance={provenance} onChange={handleChange} type="number" />

        {/* Light Output */}
        <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid #e0e0e0', paddingBottom: 4, marginBottom: 12, marginTop: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Light Output</span>
        </div>
        <Field label="Lumens" field="lumens" value={values.lumens} provenance={provenance} onChange={handleChange} type="number" isUnmapped={isUnmapped('lumens')} />
        <Field label="CRI" field="cri" value={values.cri} provenance={provenance} onChange={handleChange} type="number" isUnmapped={isUnmapped('cri')} />
        <Field label="Efficacy (LPW)" field="efficacy" value={values.efficacy} provenance={provenance} onChange={handleChange} type="number" />
        <Field label="Beam Angle (°)" field="beamAngle" value={values.beamAngle} provenance={provenance} onChange={handleChange} type="number" />
        {Array.isArray(product.cctOptions) && (product.cctOptions as number[]).length > 0 && (
          <div style={{ gridColumn: '1 / -1', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Available CCTs
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(product.cctOptions as number[]).map((cct) => (
                <span key={cct} style={{ background: '#f0f0f0', padding: '3px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {cct}K
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Physical */}
        <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid #e0e0e0', paddingBottom: 4, marginBottom: 12, marginTop: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Physical</span>
        </div>
        <Field label="Form Factor" field="formFactor" value={values.formFactor} provenance={provenance} onChange={handleChange} isUnmapped={isUnmapped('formFactor')} />
        <Field label="Dimensions" field="dimensions" value={values.dimensions} provenance={provenance} onChange={handleChange} isUnmapped={isUnmapped('dimensions')} />
        <Field label="IP Rating" field="ipRating" value={values.ipRating} provenance={provenance} onChange={handleChange} />
        <Field label="NEMA Rating" field="nemaRating" value={values.nemaRating} provenance={provenance} onChange={handleChange} />
      </div>

      {/* Legend */}
      <div style={{ marginTop: 20, display: 'flex', gap: 16, fontSize: 12, color: '#6b6b6b', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#107c10', display: 'inline-block' }} /> Regex</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f7a600', display: 'inline-block' }} /> AI Fallback</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0078d4', display: 'inline-block' }} /> Manual</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ccc', display: 'inline-block' }} /> Not extracted</span>
        <span style={{ color: '#f7a600' }}>Orange border = low confidence (&lt;30%)</span>
      </div>
    </div>
  )
}
