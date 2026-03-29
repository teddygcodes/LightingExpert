import { PDFPage, PDFFont } from 'pdf-lib'
import { MARGINS, HEADER_FOOTER, PDF_COLORS } from './layout-constants'

const { SIDE } = MARGINS
const { HEADER_Y_FROM_TOP, FOOTER_Y_BASELINE, FOOTER_RULE_Y, DARK_BAR_HEIGHT } = HEADER_FOOTER
const { BLACK, WHITE, GRAY, RULE: RULE_COLOR, DARK_BAR } = PDF_COLORS

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export interface HeaderFooterOptions {
  projectName: string
  fixtureType?: string
  fixtureDescription?: string
  catalogString?: string      // shown on spec-sheet pages (Style B)
  isSpecSheetPage?: boolean   // true → dark header bar (Style B)
  revisionNumber: number
  date: string
  displayPageNumber: number
  displayTotalPages: number
}

export function addHeaderFooter(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  opts: HeaderFooterOptions
): void {
  const { width, height } = page.getSize()
  const { regular, bold } = fonts

  if (opts.isSpecSheetPage) {
    // ── Style B: Dark header bar ──────────────────────────────────────
    const barY = height - DARK_BAR_HEIGHT
    page.drawRectangle({
      x: 0,
      y: barY,
      width,
      height: DARK_BAR_HEIGHT,
      color: DARK_BAR,
    })

    // Project name — far left, 9pt regular white
    const projectText = truncate(opts.projectName, 50)
    page.drawText(projectText, {
      x: SIDE,
      y: barY + (DARK_BAR_HEIGHT - 9) / 2,
      font: regular,
      size: 9,
      color: WHITE,
    })

    // Fixture type letter — far right, 18pt bold white (dominant visual)
    if (opts.fixtureType) {
      const typeText = opts.fixtureType
      const typeWidth = bold.widthOfTextAtSize(typeText, 18)
      const typeX = width - SIDE_MARGIN - typeWidth
      const typeY = barY + (DARK_BAR_HEIGHT - 18) / 2
      page.drawText(typeText, {
        x: typeX,
        y: typeY,
        font: bold,
        size: 18,
        color: WHITE,
      })

      // Catalog string — immediately left of type letter, 11pt regular white
      if (opts.catalogString) {
        const catText = truncate(opts.catalogString, 50)
        const catWidth = regular.widthOfTextAtSize(catText, 11)
        const catX = typeX - catWidth - 8  // 8pt gap
        page.drawText(catText, {
          x: catX,
          y: barY + (DARK_BAR_HEIGHT - 11) / 2,
          font: regular,
          size: 11,
          color: WHITE,
        })
      }
    }
  } else {
    // ── Style A: Light header ─────────────────────────────────────────
    const headerY = height - HEADER_Y_FROM_TOP

    page.drawText(truncate(opts.projectName, 50), {
      x: SIDE,
      y: headerY,
      font: bold,
      size: 9,
      color: BLACK,
    })

    if (opts.fixtureType) {
      const rightLabel = truncate(
        `TYPE ${opts.fixtureType}${opts.fixtureDescription ? ' — ' + opts.fixtureDescription : ''}`,
        40
      )
      const labelWidth = regular.widthOfTextAtSize(rightLabel, 9)
      page.drawText(rightLabel, {
        x: width - SIDE - labelWidth,
        y: headerY,
        font: regular,
        size: 9,
        color: GRAY,
      })
    }

    page.drawLine({
      start: { x: SIDE_MARGIN, y: headerY - 8 },
      end: { x: width - SIDE_MARGIN, y: headerY - 8 },
      thickness: 0.5,
      color: RULE_COLOR,
    })
  }

  // ── Footer (both styles) ──────────────────────────────────────────
  page.drawLine({
    start: { x: SIDE_MARGIN, y: FOOTER_RULE_Y },
    end: { x: width - SIDE_MARGIN, y: FOOTER_RULE_Y },
    thickness: 0.5,
    color: RULE_COLOR,
  })

  const revStr = String(opts.revisionNumber).padStart(2, '0')
  page.drawText(`Lighting Submittal — Rev ${revStr} — ${opts.date}`, {
    x: SIDE_MARGIN,
    y: FOOTER_Y_BASELINE,
    font: regular,
    size: 8,
    color: GRAY,
  })

  const pageStr = `Page ${opts.displayPageNumber} of ${opts.displayTotalPages}`
  const pageStrWidth = regular.widthOfTextAtSize(pageStr, 8)
  page.drawText(pageStr, {
    x: width - SIDE_MARGIN - pageStrWidth,
    y: FOOTER_Y_BASELINE,
    font: regular,
    size: 8,
    color: GRAY,
  })
}
