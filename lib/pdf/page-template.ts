import { PDFPage, PDFFont, rgb } from 'pdf-lib'

const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.42, 0.42, 0.42)
const RULE_COLOR = rgb(0.80, 0.80, 0.80)

const SIDE_MARGIN = 36
const HEADER_Y_FROM_TOP = 30  // baseline from top
const FOOTER_Y_BASELINE = 20
const FOOTER_RULE_Y = 33      // rule above footer text

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export interface HeaderFooterOptions {
  projectName: string
  fixtureType?: string
  fixtureDescription?: string
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

  const headerY = height - HEADER_Y_FROM_TOP

  // ── Header ─────────────────────────────────────────────────────────
  page.drawText(truncate(opts.projectName, 50), {
    x: SIDE_MARGIN,
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
      x: width - SIDE_MARGIN - labelWidth,
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

  // ── Footer ─────────────────────────────────────────────────────────
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
