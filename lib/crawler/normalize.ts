import {
  Voltage,
  DimmingType,
  MountingType,
  Environment,
} from '@prisma/client'

// ─── Voltage Map ──────────────────────────────────────────────────────────────

export const VOLTAGE_MAP: Record<string, Voltage> = {
  '120': Voltage.V120,
  '120v': Voltage.V120,
  '277': Voltage.V277,
  '277v': Voltage.V277,
  '120/277': Voltage.V120_277,
  '120-277': Voltage.V120_277,
  '120v/277v': Voltage.V120_277,
  '347': Voltage.V347,
  '347v': Voltage.V347,
  '347/480': Voltage.V347_480,
  '347-480': Voltage.V347_480,
  '120/347': Voltage.V120_347,
  '120-347': Voltage.V120_347,
  'uvolt': Voltage.V120_347,
  'uvolt (120-347v)': Voltage.V120_347,
  'universal': Voltage.UNIVERSAL,
  'universal (120-277v)': Voltage.V120_277,
  'multi-volt': Voltage.UNIVERSAL,
  'multivolt': Voltage.UNIVERSAL,
  // Acuity-specific multi-voltage shorthand
  'mvolt': Voltage.UNIVERSAL,
  'xvolt': Voltage.UNIVERSAL,
  'hvolt': Voltage.UNIVERSAL,
  // Enum name aliases (for re-normalization safety)
  'v120': Voltage.V120,
  'v277': Voltage.V277,
  'v120_277': Voltage.V120_277,
  'v347': Voltage.V347,
  'v347_480': Voltage.V347_480,
  'v120_347': Voltage.V120_347,
}

// ─── Dimming Type Map ─────────────────────────────────────────────────────────

export const DIMMING_MAP: Record<string, DimmingType> = {
  '0-10v': DimmingType.V0_10,
  '0-10': DimmingType.V0_10,
  '0/10v': DimmingType.V0_10,
  '0-10v dimming': DimmingType.V0_10,
  'dali': DimmingType.DALI,
  'dali 2': DimmingType.DALI,
  'triac': DimmingType.TRIAC,
  'phase': DimmingType.PHASE,
  'phase cut': DimmingType.PHASE,
  'lutron': DimmingType.LUTRON,
  'lutron hi-lume': DimmingType.LUTRON,
  'elv': DimmingType.ELV,
  'nlight': DimmingType.NLIGHT,
  // Acuity-specific labels
  'digital': DimmingType.V0_10,         // Acuity "Digital" = 0-10V digital dimming
  'digital dimming': DimmingType.V0_10,
  'dim to off': DimmingType.V0_10,
}

// ─── Mounting Type Map ────────────────────────────────────────────────────────

export const MOUNTING_MAP: Record<string, MountingType> = {
  'recessed': MountingType.RECESSED,
  'surface': MountingType.SURFACE,
  'surface mount': MountingType.SURFACE,
  'pendant': MountingType.PENDANT,
  'chain': MountingType.CHAIN,
  'chain mount': MountingType.CHAIN,
  'pole': MountingType.POLE,
  'pole mount': MountingType.POLE,
  'wall': MountingType.WALL,
  'wall mount': MountingType.WALL,
  'ground': MountingType.GROUND,
  'track': MountingType.TRACK,
  'stem': MountingType.STEM,
  'stem mount': MountingType.STEM,
  'cable': MountingType.CABLE,
  'cable mount': MountingType.CABLE,
  'grid': MountingType.GRID_TBAR,
  't-bar': MountingType.GRID_TBAR,
  'tbar': MountingType.GRID_TBAR,
  't-grid': MountingType.GRID_TBAR,
}

// ─── Form Factor Map ──────────────────────────────────────────────────────────
// Canonical form factor values for consistent cross-reference matching

export const FORM_FACTOR_MAP: Record<string, string> = {
  // 2x4 troffers/panels
  '2x4': '2X4',
  '2 x 4': '2X4',
  "2'x4'": '2X4',
  '2x4"': '2X4',
  '24x48': '2X4',
  '24"x48"': '2X4',
  '2ft x 4ft': '2X4',
  '2ft×4ft': '2X4',

  // 2x2 troffers/panels
  '2x2': '2X2',
  '2 x 2': '2X2',
  "2'x2'": '2X2',
  '24x24': '2X2',
  '24"x24"': '2X2',
  '2ft x 2ft': '2X2',

  // 1x4 troffers/panels
  '1x4': '1X4',
  '1 x 4': '1X4',
  "1'x4'": '1X4',
  '12x48': '1X4',
  '12"x48"': '1X4',
  '1ft x 4ft': '1X4',

  // Downlights by diameter
  '4"': '4_INCH_ROUND',
  '4 inch': '4_INCH_ROUND',
  '4-inch': '4_INCH_ROUND',
  '4in': '4_INCH_ROUND',
  '4"round': '4_INCH_ROUND',

  '6"': '6_INCH_ROUND',
  '6 inch': '6_INCH_ROUND',
  '6-inch': '6_INCH_ROUND',
  '6in': '6_INCH_ROUND',
  '6"round': '6_INCH_ROUND',

  '8"': '8_INCH_ROUND',
  '8 inch': '8_INCH_ROUND',
  '8-inch': '8_INCH_ROUND',
  '8in': '8_INCH_ROUND',

  // Square downlights
  '4"sq': '4_INCH_SQUARE',
  '4" square': '4_INCH_SQUARE',
  '6"sq': '6_INCH_SQUARE',
  '6" square': '6_INCH_SQUARE',
}

export function normalizeFormFactor(raw: string): string {
  const normalized = raw.toLowerCase().trim()
  return FORM_FACTOR_MAP[normalized] ?? raw.toUpperCase().trim()
}

export function normalizeVoltage(raw: string): Voltage | undefined {
  const normalized = raw.toLowerCase().trim()
  return VOLTAGE_MAP[normalized]
}

/**
 * Analyze a comma/semicolon-separated list of voltage options and return
 * the most representative Voltage enum value.
 *
 * Strategy:
 * 1. Split tokens, normalize each individually
 * 2. If any token is a universal keyword (MVOLT, XVOLT, HVOLT, etc.) → UNIVERSAL
 * 3. If tokens span both low-voltage (120/208/240) AND high-voltage (347/480) → UNIVERSAL
 * 4. If tokens include both 120 and 277 → V120_277
 * 5. Else pick the best single match (prefer multi-voltage enums over single)
 */
export function normalizeVoltageList(raw: string): Voltage | undefined {
  const tokens = raw.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean)
  if (tokens.length === 0) return undefined

  // Check for universal keywords first
  const universalKeywords = ['universal', 'multi-volt', 'multivolt', 'mvolt', 'xvolt', 'hvolt']
  if (tokens.some(t => universalKeywords.includes(t))) return Voltage.UNIVERSAL

  // Collect all individual enum matches and raw numeric voltages
  const enumValues = new Set<Voltage>()
  const numericVoltages = new Set<number>()

  for (const tok of tokens) {
    const v = normalizeVoltage(tok)
    if (v) enumValues.add(v)
    const numMatch = tok.match(/^(\d{3})/)
    if (numMatch) numericVoltages.add(parseInt(numMatch[1]))
  }

  if (enumValues.has(Voltage.UNIVERSAL)) return Voltage.UNIVERSAL

  // Check coverage: low-voltage + high-voltage → UNIVERSAL
  const hasLow = numericVoltages.has(120) || numericVoltages.has(208) || numericVoltages.has(240)
  const hasMid = numericVoltages.has(277)
  const hasHigh = numericVoltages.has(347) || numericVoltages.has(480)

  if (hasLow && hasHigh) return Voltage.UNIVERSAL
  if (hasMid && hasHigh) return Voltage.UNIVERSAL

  // Prefer broadest multi-voltage enum that matched
  if (enumValues.has(Voltage.V120_347)) return Voltage.V120_347
  if (enumValues.has(Voltage.V347_480)) return Voltage.V347_480
  if (enumValues.has(Voltage.V120_277)) return Voltage.V120_277

  // Check if 120 AND 277 both present even without explicit "120-277" token
  if (numericVoltages.has(120) && numericVoltages.has(277)) return Voltage.V120_277

  // Single token — fall back to normalizeVoltage
  if (tokens.length === 1) return normalizeVoltage(tokens[0])

  // Multiple tokens but no broad coverage — pick first recognizable enum
  for (const tok of tokens) {
    const v = normalizeVoltage(tok)
    if (v) return v
  }

  return undefined
}

export function normalizeDimmingTypes(raw: string): DimmingType[] {
  const types: DimmingType[] = []
  const parts = raw.toLowerCase().split(/[,/&+]/).map((p) => p.trim())
  for (const part of parts) {
    const dt = DIMMING_MAP[part]
    if (dt && !types.includes(dt)) types.push(dt)
  }
  return types
}

export function normalizeMountingTypes(raw: string): MountingType[] {
  const types: MountingType[] = []
  const parts = raw.toLowerCase().split(/[,/&+]/).map((p) => p.trim())
  for (const part of parts) {
    const mt = MOUNTING_MAP[part]
    if (mt && !types.includes(mt)) types.push(mt)
  }
  return types
}

// ─── Spec Sheet Primary Link Selection ────────────────────────────────────────

// Filename/label patterns that indicate accessory or supplemental documents,
// not the primary product spec sheet.
const ACCESSORY_FILENAME_PATTERNS = [
  /\bela-wg\b/i,        // ELA wire guards
  /wire[-_]?guard/i,
  /stem[-_]?kit/i,
  /\bwpvs\b/i,          // wet protection vandal shield
  /accessory/i,
  /accessories/i,
]
const ACCESSORY_LABEL_PATTERNS = [
  /wire[-_]?\s*guard/i,
  /stem[-_]?\s*kit/i,
  /accessory/i,
  /accessories/i,
]

/**
 * Given the list of spec sheet links scraped from an Acuity product page,
 * return the best primary link for this specific productId.
 *
 * Priority:
 * 1. Links whose URL contains this productId (own-product docs over related-product docs)
 * 2. Exclude known accessory/supplemental filenames and labels
 * 3. First remaining candidate (order on page is generally most-relevant-first)
 */
export function pickBestSpecSheet(
  links: Array<{ label: string; url: string }>,
  productId: string,
): { label: string; url: string } | null {
  if (!links.length) return null

  // Extract the productId embedded in the Acuity getasset URL
  // Format: /api/products/getasset/{brand}/{productId}/{assetId}/{file}.pdf
  function urlProductId(url: string): string | null {
    const m = url.match(/\/api\/products\/getasset\/[^/]+\/(\d+)\//)
    return m ? m[1] : null
  }

  function isAccessory(link: { label: string; url: string }): boolean {
    const filename = (link.url.split('/').pop() ?? '').split('?')[0]
    return (
      ACCESSORY_FILENAME_PATTERNS.some(p => p.test(filename)) ||
      ACCESSORY_LABEL_PATTERNS.some(p => p.test(link.label))
    )
  }

  // Step 1: prefer own-product links
  const ownLinks = links.filter(l => urlProductId(l.url) === productId)
  const pool = ownLinks.length > 0 ? ownLinks : links

  // Step 2: exclude accessories from the pool
  const mainLinks = pool.filter(l => !isAccessory(l))
  const candidates = mainLinks.length > 0 ? mainLinks : pool

  return candidates[0]
}
