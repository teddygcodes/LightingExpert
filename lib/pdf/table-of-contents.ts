import { PDFDocument, PDFPage, PDFFont, PDFName, PDFNull, PDFRef, rgb } from 'pdf-lib'
import { PDF_COLORS, MARGINS } from './layout-constants'

const { BLACK, DARK, GRAY, ACCENT, LIGHT_GRAY } = PDF_COLORS
const WHITE = rgb(1, 1, 1)
const RULE_GRAY = rgb(0.85, 0.85, 0.85)
const SIDE = MARGINS.SIDE

export interface TocEntry {
  type: string
  qty: number
  manufacturer: string
  catalogNumber: string
  displayPageNumber: number
  pageRef: PDFRef
}

const COLS = [
  { label: 'TYPE',         x: SIDE,     w: 48  },
  { label: 'QTY',          x: SIDE+48,  w: 36  },
  { label: 'MANUFACTURER', x: SIDE+84,  w: 170 },
  { label: 'CATALOG #',    x: SIDE+254, w: 200 },
  { label: 'PAGE',         x: SIDE+454, w: 86  },
] as const

const TABLE_RIGHT = 576
const HEADER_H = 24
const ROW_H = 24

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export function buildTableOfContents(
  pdfDoc: PDFDocument,
  tocPage: PDFPage,
  entries: TocEntry[],
  fonts: { regular: PDFFont; bold: PDFFont }
): void {
  const { width } = tocPage.getSize()
  const { regular, bold } = fonts

  // ── Accent bar at top ────────────────────────────────────────────
  tocPage.drawRectangle({ x: 0, y: 792 - 4, width, height: 4, color: ACCENT })

  // ── Title ────────────────────────────────────────────────────────
  const title = 'TABLE OF CONTENTS'
  const titleW = bold.widthOfTextAtSize(title, 13)
  tocPage.drawText(title, {
    x: (width - titleW) / 2,
    y: 745,
    font: bold,
    size: 13,
    color: DARK,
  })

  // Title underline accent
  const underlineW = 40
  tocPage.drawRectangle({
    x: (width - underlineW) / 2,
    y: 740,
    width: underlineW,
    height: 2,
    color: ACCENT,
  })

  // ── Column headers ───────────────────────────────────────────────
  let y = 716
  tocPage.drawRectangle({
    x: SIDE,
    y: y - 4,
    width: TABLE_RIGHT - SIDE,
    height: HEADER_H,
    color: DARK,
  })
  for (const col of COLS) {
    tocPage.drawText(col.label, {
      x: col.x + 5,
      y: y + 5,
      font: bold,
      size: 8,
      color: WHITE,
    })
  }
  y -= HEADER_H

  // ── Data rows + link annotations ─────────────────────────────────
  const annotRefs: PDFRef[] = []

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const rowY = y - 4
    const rowTop = rowY + ROW_H

    // Alternating row background (subtle warm tint)
    if (i % 2 === 0) {
      tocPage.drawRectangle({
        x: SIDE,
        y: rowY,
        width: TABLE_RIGHT - SIDE,
        height: ROW_H,
        color: rgb(0.97, 0.96, 0.95), // warm off-white matching --bg
      })
    }

    // Red accent dash on type column
    tocPage.drawRectangle({
      x: SIDE, y: rowY, width: 3, height: ROW_H,
      color: ACCENT,
    })

    // Row text
    tocPage.drawText(e.type, {
      x: COLS[0].x + 8, y: y + 5, font: bold, size: 10, color: BLACK,
    })
    tocPage.drawText(String(e.qty), {
      x: COLS[1].x + 5, y: y + 5, font: regular, size: 9, color: BLACK,
    })
    tocPage.drawText(truncate(e.manufacturer, 24), {
      x: COLS[2].x + 5, y: y + 5, font: regular, size: 9, color: BLACK,
    })
    tocPage.drawText(truncate(e.catalogNumber, 30), {
      x: COLS[3].x + 5, y: y + 5, font: regular, size: 9, color: GRAY,
    })
    tocPage.drawText(String(e.displayPageNumber), {
      x: COLS[4].x + 5, y: y + 5, font: regular, size: 9, color: GRAY,
    })

    // Row separator
    tocPage.drawLine({
      start: { x: SIDE, y: rowY },
      end: { x: TABLE_RIGHT, y: rowY },
      thickness: 0.25,
      color: RULE_GRAY,
    })

    // PDF GoTo link annotation
    const linkAnnot = pdfDoc.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Link'),
      Rect: pdfDoc.context.obj([SIDE, rowY, TABLE_RIGHT, rowTop]),
      Border: pdfDoc.context.obj([0, 0, 0]),
      Dest: pdfDoc.context.obj([e.pageRef, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull]),
    })
    annotRefs.push(pdfDoc.context.register(linkAnnot))

    y -= ROW_H
    if (y < 60) break
  }

  // Attach all annotations to the TOC page
  if (annotRefs.length > 0) {
    tocPage.node.set(PDFName.of('Annots'), pdfDoc.context.obj(annotRefs))
  }

  // ── Footer accent bar ────────────────────────────────────────────
  tocPage.drawRectangle({ x: 0, y: 0, width, height: 3, color: ACCENT })
}
