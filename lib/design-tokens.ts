/**
 * Shared design tokens — single source of truth for colors used across
 * server components and inline styles. Client components can also use
 * CSS custom properties via `var(--accent)` etc. in globals.css.
 */

// ─── Brand Colors ────────────────────────────────────────────────────────────

export const COLORS = {
  accent: '#d13438',
  accentHover: '#b12b2e',
  text: '#1a1a1a',
  textSecondary: '#3d3d3d',
  textMuted: '#6b6b6b',
  textFaint: '#a0a0a0',
  surface: '#ffffff',
  surfaceRaised: '#fafaf9',
  bg: '#f5f4f2',
  border: '#e2e1de',
  borderStrong: '#c8c7c4',
  blue: '#0078d4',
  green: '#107c10',
  orange: '#ff8c00',
} as const

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const SHADOWS = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 2px 8px rgba(0,0,0,0.08)',
  lg: '0 4px 16px rgba(0,0,0,0.10)',
} as const

// ─── Status Colors ───────────────────────────────────────────────────────────

/** Submittal status → badge background color */
export const SUBMITTAL_STATUS_COLOR: Record<string, string> = {
  DRAFT: COLORS.textMuted,
  GENERATED: COLORS.blue,
  SUBMITTED: COLORS.blue,
  APPROVED: COLORS.green,
  APPROVED_AS_NOTED: COLORS.green,
  REVISE_RESUBMIT: COLORS.orange,
  REJECTED: COLORS.accent,
  FINAL: COLORS.green,
  ISSUED_FOR_REVIEW: COLORS.blue,
  ISSUED_FOR_CONSTRUCTION: COLORS.green,
  SUPERSEDED: COLORS.accent,
}

/** Crawl log status → badge background color */
export const CRAWL_STATUS_COLOR: Record<string, string> = {
  RUNNING: COLORS.blue,
  COMPLETED: COLORS.green,
  FAILED: COLORS.accent,
  PARTIAL: COLORS.orange,
  INTERRUPTED: COLORS.textMuted,
}
