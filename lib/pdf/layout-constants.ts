import { rgb } from 'pdf-lib'

/**
 * Centralized PDF layout constants.
 * All page sizes, margins, and color values in one place.
 */

// ─── Page Sizes (in points, 72pt = 1 inch) ──────────────────────────────────

export const PAGE = {
  LETTER_W: 612,
  LETTER_H: 792,
  LANDSCAPE_W: 792,
  LANDSCAPE_H: 612,
} as const

// ─── Margins ─────────────────────────────────────────────────────────────────

export const MARGINS = {
  SIDE: 36,
  TOP_USABLE: 752,     // top of usable area (below header reserve)
  BOTTOM_USABLE: 52,   // bottom of usable area (above footer reserve)
} as const

// ─── Header/Footer ──────────────────────────────────────────────────────────

export const HEADER_FOOTER = {
  HEADER_Y_FROM_TOP: 30,
  FOOTER_Y_BASELINE: 20,
  FOOTER_RULE_Y: 33,
  DARK_BAR_HEIGHT: 45,
} as const

// ─── Fixture Schedule Table ──────────────────────────────────────────────────

export const TABLE = {
  HEADER_ROW_H: 22,
  ROW_H: 18,
  LEFT: 36,
  RIGHT: 576,
} as const

// ─── Colors (pdf-lib RGB) ───────────────────────────────────────────────────

export const PDF_COLORS = {
  BLACK: rgb(0, 0, 0),
  WHITE: rgb(1, 1, 1),
  DARK: rgb(0.1, 0.1, 0.1),
  DARK_BAR: rgb(0.102, 0.102, 0.102),  // #1a1a1a
  GRAY: rgb(0.42, 0.42, 0.42),
  LIGHT_GRAY: rgb(0.93, 0.93, 0.93),
  RULE: rgb(0.80, 0.80, 0.80),
  ACCENT: rgb(0.82, 0.20, 0.22),       // #d13438
} as const
