import Anthropic from '@anthropic-ai/sdk'
import { FieldProvenance, FieldProvenanceMap, ProvenanceSource } from '../types'
import {
  normalizeVoltage,
  normalizeDimmingTypes,
  normalizeMountingTypes,
  normalizeFormFactor,
} from './normalize'

// ─── Raw extraction result ────────────────────────────────────────────────────

export interface RawSpecs {
  wattage?: number
  wattageMin?: number
  wattageMax?: number
  lumens?: number
  lumensMin?: number
  lumensMax?: number
  cri?: number
  cctOptions?: number[]
  voltage?: string
  ipRating?: string
  nemaRating?: string
  dlcListed?: boolean
  dlcPremium?: boolean
  ulListed?: boolean
  dimmable?: boolean
  dimmingType?: string
  wetLocation?: boolean
  dampLocation?: boolean
  efficacy?: number
  dimensions?: string
  beamAngle?: number
  formFactor?: string
  category?: string
  mountingType?: string
  emergencyBackup?: boolean
}

// Provenance per field
function fp(source: ProvenanceSource, confidence: number, rawValue?: string): FieldProvenance {
  return { source, confidence, rawValue }
}

// ─── Pass 1: Regex Extraction ─────────────────────────────────────────────────

export function extractByRegex(text: string): { specs: RawSpecs; provenance: FieldProvenanceMap } {
  const specs: RawSpecs = {}
  const provenance: FieldProvenanceMap = {}

  // Wattage — single or range
  const wattRange = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*[Ww](?:att)?s?\b/)
  const wattSingle = text.match(/(\d+(?:\.\d+)?)\s*[Ww](?:att)?s?\b/)
  if (wattRange) {
    specs.wattageMin = parseFloat(wattRange[1])
    specs.wattageMax = parseFloat(wattRange[2])
    provenance.wattageMin = fp('REGEX', 0.9, wattRange[0])
    provenance.wattageMax = fp('REGEX', 0.9, wattRange[0])
  } else if (wattSingle) {
    specs.wattage = parseFloat(wattSingle[1])
    provenance.wattage = fp('REGEX', 0.9, wattSingle[0])
  }

  // Lumens — single or range
  const lumRange = text.match(/(\d{3,5})\s*[-–]\s*(\d{3,5})\s*[Ll][Mm]/)
  const lumSingle = text.match(/(\d{3,5})\s*[Ll][Mm]/)
  if (lumRange) {
    specs.lumensMin = parseInt(lumRange[1])
    specs.lumensMax = parseInt(lumRange[2])
    provenance.lumensMin = fp('REGEX', 0.9, lumRange[0])
    provenance.lumensMax = fp('REGEX', 0.9, lumRange[0])
  } else if (lumSingle) {
    specs.lumens = parseInt(lumSingle[1])
    provenance.lumens = fp('REGEX', 0.9, lumSingle[0])
  }

  // CRI
  const criMatch = text.match(/CRI\s*[>≥]?\s*(\d{2})\+?/i) ||
    text.match(/(\d{2})\s*CRI/i) ||
    text.match(/Color\s+Rendering\s+Index[:\s]+(\d{2})/i)
  if (criMatch) {
    specs.cri = parseInt(criMatch[1])
    provenance.cri = fp('REGEX', 0.85, criMatch[0])
  }

  // CCT options — extract all K values
  const cctMatches = [...text.matchAll(/(\d{4})[Kk]\b/g)]
  if (cctMatches.length > 0) {
    specs.cctOptions = [...new Set(cctMatches.map((m) => parseInt(m[1])))].sort()
    provenance.cctOptions = fp('REGEX', 0.9, cctMatches.map((m) => m[0]).join(', '))
  }

  // Voltage
  const voltMatch = text.match(/(\d{3}(?:\/\d{3})?)\s*[Vv](?:olt)?s?\b/) ||
    text.match(/[Uu]niversal\s*\(?\s*120[-\/]277\s*[Vv]?\s*\)?/i) ||
    text.match(/[Uu]niversal/i)
  if (voltMatch) {
    provenance.voltage = fp('REGEX', 0.85, voltMatch[0])
    specs.voltage = voltMatch[0].trim()
  }

  // IP Rating
  const ipMatch = text.match(/\bIP\s*(\d{2})\b/i)
  if (ipMatch) {
    specs.ipRating = `IP${ipMatch[1]}`
    provenance.ipRating = fp('REGEX', 0.9, ipMatch[0])
  }

  // NEMA Rating
  const nemaMatch = text.match(/\bNEMA\s*(\d+[A-Z]?(?:\/\d+[A-Z]?)*)\b/i)
  if (nemaMatch) {
    specs.nemaRating = `NEMA ${nemaMatch[1]}`
    provenance.nemaRating = fp('REGEX', 0.9, nemaMatch[0])
  }

  // DLC
  if (/DLC\s+Premium/i.test(text)) {
    specs.dlcListed = true
    specs.dlcPremium = true
    provenance.dlcListed = fp('REGEX', 0.95, 'DLC Premium')
    provenance.dlcPremium = fp('REGEX', 0.95, 'DLC Premium')
  } else if (/\bDLC\b|DesignLights\s+Consortium/i.test(text)) {
    specs.dlcListed = true
    specs.dlcPremium = false
    provenance.dlcListed = fp('REGEX', 0.9, 'DLC')
    provenance.dlcPremium = fp('REGEX', 0.8, 'DLC (not premium)')
  }

  // UL
  if (/\bUL\s*Listed\b|\bcULus\b|\bUL\s*\d{4}/i.test(text)) {
    specs.ulListed = true
    provenance.ulListed = fp('REGEX', 0.9, 'UL Listed')
  }

  // Dimmable + dimming type
  const dimmingMatch = text.match(/0[-–]10\s*[Vv]|DALI|triac|phase.?cut|lutron|elv|nlight/i)
  if (dimmingMatch) {
    specs.dimmable = true
    specs.dimmingType = dimmingMatch[0]
    provenance.dimmable = fp('REGEX', 0.9, dimmingMatch[0])
    provenance.dimmingType = fp('REGEX', 0.85, dimmingMatch[0])
  } else if (/dimmable/i.test(text)) {
    specs.dimmable = true
    provenance.dimmable = fp('REGEX', 0.8, 'dimmable')
  }

  // Wet / damp location
  if (/wet\s+location/i.test(text) || /rated\s+wet/i.test(text)) {
    specs.wetLocation = true
    provenance.wetLocation = fp('REGEX', 0.9, 'wet location')
  } else if (/damp\s+location/i.test(text) || /rated\s+damp/i.test(text)) {
    specs.dampLocation = true
    provenance.dampLocation = fp('REGEX', 0.9, 'damp location')
  }

  // Efficacy (LPW)
  const efficacyMatch = text.match(/(\d{2,3}(?:\.\d+)?)\s*[Ll][Pp][Ww]/) ||
    text.match(/(\d{2,3}(?:\.\d+)?)\s*[Ll](?:umens?)?\s*(?:per|\/)\s*[Ww](?:att)?/i)
  if (efficacyMatch) {
    specs.efficacy = parseFloat(efficacyMatch[1])
    provenance.efficacy = fp('REGEX', 0.85, efficacyMatch[0])
  }

  // Dimensions
  const dimMatch = text.match(/(\d+(?:\.\d+)?)["\s]*[Xx×]\s*(\d+(?:\.\d+)?)["\s]*(?:[Xx×]\s*(\d+(?:\.\d+)?"?))?/)
  if (dimMatch) {
    specs.dimensions = dimMatch[0].trim()
    provenance.dimensions = fp('REGEX', 0.75, dimMatch[0])
  }

  // Beam angle
  const beamMatch = text.match(/(\d+(?:\.\d+)?)[°\s]*(?:beam|beam\s+angle|field\s+angle)/i)
  if (beamMatch) {
    specs.beamAngle = parseFloat(beamMatch[1])
    provenance.beamAngle = fp('REGEX', 0.8, beamMatch[0])
  }

  // Emergency backup
  if (/emergency\s+backup|EM\s+driver|EM\s+battery/i.test(text)) {
    specs.emergencyBackup = true
    provenance.emergencyBackup = fp('REGEX', 0.85, 'emergency backup')
  }

  return { specs, provenance }
}

// ─── Pass 2: AI Fallback ──────────────────────────────────────────────────────

export async function extractByAI(
  rawText: string,
  existingSpecs: RawSpecs,
  existingProvenance: FieldProvenanceMap
): Promise<{ specs: RawSpecs; provenance: FieldProvenanceMap }> {
  const client = new Anthropic()

  const prompt = `You are a lighting specification extractor. Given the raw text from a lighting product page or spec sheet, extract the following fields as a JSON object. Only include fields you can find with confidence.

Fields to extract:
- wattage (number, nominal wattage)
- wattageMin, wattageMax (if selectable range)
- lumens (number, nominal lumens)
- lumensMin, lumensMax (if selectable range)
- cri (integer, color rendering index 70-100)
- cctOptions (array of integers, e.g. [2700, 3000, 3500, 4000])
- voltage (string, e.g. "120/277", "Universal")
- dimmable (boolean)
- dimmingType (string, e.g. "0-10V", "DALI")
- dlcListed (boolean)
- dlcPremium (boolean)
- ulListed (boolean)
- wetLocation (boolean)
- dampLocation (boolean)
- efficacy (number, lumens per watt)
- ipRating (string, e.g. "IP65")
- nemaRating (string, e.g. "NEMA 3R")
- beamAngle (number in degrees)
- dimensions (string, e.g. "23.75 x 47.75")
- formFactor (string, e.g. "2x4", "6-inch", "4-inch")
- category (string, e.g. "flat panel", "downlight", "troffer")
- mountingType (string, e.g. "recessed", "surface")
- emergencyBackup (boolean)

Raw product text:
---
${rawText.slice(0, 4000)}
---

Respond ONLY with a valid JSON object. No explanation.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') return { specs: existingSpecs, provenance: existingProvenance }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { specs: existingSpecs, provenance: existingProvenance }

    const aiSpecs = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const mergedSpecs = { ...existingSpecs }
    const mergedProvenance = { ...existingProvenance }

    // Merge AI fields — but never overwrite high-confidence (≥0.8) regex values
    for (const [key, value] of Object.entries(aiSpecs)) {
      if (value === null || value === undefined) continue
      const existing = existingProvenance[key]
      if (existing && existing.source === 'REGEX' && existing.confidence >= 0.8) continue

      ;(mergedSpecs as Record<string, unknown>)[key] = value
      mergedProvenance[key] = fp('AI_FALLBACK', 0.7, String(value))
    }

    return { specs: mergedSpecs, provenance: mergedProvenance }
  } catch (err) {
    console.error('[Parser] AI fallback failed:', err)
    return { specs: existingSpecs, provenance: existingProvenance }
  }
}

// ─── Pass 3: Config Table Extraction ─────────────────────────────────────────

export async function extractConfigTable(
  rawText: string
): Promise<Record<string, string[]> | null> {
  const client = new Anthropic()

  const prompt = `You are parsing a lighting product ordering/configuration table from a spec sheet.
Extract the column headers and their options as a JSON object where keys are column names and values are arrays of option codes.
Only include columns that represent selectable ordering options (lumens, CCT, driver, voltage, optics, trim, CRI, emergency, etc.).
Ignore columns like SERIES or product family name that have only one static value representing the whole product line.

Raw spec sheet text:
---
${rawText.slice(0, 6000)}
---

Respond ONLY with a valid JSON object like {"LUMENS": ["600L","1200L"], "CCT": ["27K","30K"]}. No explanation.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = response.content[0]
    if (content.type !== 'text') return null
    const match = content.text.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as Record<string, string[]>
  } catch (err) {
    console.error('[Parser] Config table extraction failed:', err)
    return null
  }
}

// ─── Compute overall confidence ───────────────────────────────────────────────

export function computeOverallConfidence(provenance: FieldProvenanceMap): number {
  const values = Object.values(provenance)
  if (values.length === 0) return 0
  const sum = values.reduce((acc, p) => acc + p.confidence, 0)
  return Math.round((sum / values.length) * 100) / 100
}
