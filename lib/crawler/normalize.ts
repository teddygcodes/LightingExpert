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
  'universal': Voltage.UNIVERSAL,
  'universal (120-277v)': Voltage.V120_277,
  'multi-volt': Voltage.UNIVERSAL,
  'multivolt': Voltage.UNIVERSAL,
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
