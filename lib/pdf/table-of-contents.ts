import { PDFDocument, PDFPage, PDFFont, PDFName, PDFNull, PDFRef, rgb } from 'pdf-lib'

const BLACK = rgb(0, 0, 0)
const DARK = rgb(0.1, 0.1, 0.1)
const GRAY = rgb(0.42, 0.42, 0.42)
const LIGHT_GRAY = rgb(0.92, 0.92, 0.92)

export interface TocEntry {
  type: string
  qty: number
  manufacturer: string
  catalogNumber: string
  displayPageNumber: number
  pageRef: PDFRef
}

// Column definitions — x coords from page left edge
const COLS = [
  { label: 'TYPE',         x: 36,  w: 48  },
  { label: 'QTY',          x: 84,  w: 40  },
  { label: 'MANUFACTURER', x: 124, w: 180 },
  { label: 'CATALOG #',    x: 304, w: 180 },
  { label: 'PAGE',         x: 484, w: 60  },
] as const

const TABLE_RIGHT = 576
const HEADER_H = 22
const ROW_H = 22

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

  // ── Title ─────────────────────────────────────────────────────────
  const title = 'TABLE OF CONTENTS'
  const titleW = bold.widthOfTextAtSize(title, 14)
  tocPage.drawText(title, {
    x: (width - titleW) / 2,
    y: 748,
    font: bold,
    size: 14,
    color: BLACK,
  })

  // ── Column headers ─────────────────────────────────────────────────
  let y = 718
  tocPage.drawRectangle({
    x: 36,
    y: y - 4,
    width: TABLE_RIGHT - 36,
    height: HEADER_H,
    color: DARK,
  })
  for (const col of COLS) {
    tocPage.drawText(col.label, {
      x: col.x + 4,
      y: y + 4,
      font: bold,
      size: 9,
      color: rgb(1, 1, 1),
    })
  }
  y -= HEADER_H

  // ── Data rows + link annotations ──────────────────────────────────
  const annotRefs: PDFRef[] = []

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const rowY = y - 4
    const rowTop = rowY + ROW_H

    // Alternating background
    if (i % 2 === 0) {
      tocPage.drawRectangle({
        x: 36,
        y: rowY,
        width: TABLE_RIGHT - 36,
        height: ROW_H,
        color: LIGHT_GRAY,
      })
    }

    // Row text
    tocPage.drawText(e.type, {
      x: COLS[0].x + 4, y: y + 4, font: bold, size: 9, color: BLACK,
    })
    tocPage.drawText(String(e.qty), {
      x: COLS[1].x + 4, y: y + 4, font: regular, size: 9, color: BLACK,
    })
    tocPage.drawText(truncate(e.manufacturer, 26), {
      x: COLS[2].x + 4, y: y + 4, font: regular, size: 9, color: BLACK,
    })
    tocPage.drawText(truncate(e.catalogNumber, 26), {
      x: COLS[3].x + 4, y: y + 4, font: regular, size: 9, color: BLACK,
    })
    tocPage.drawText(String(e.displayPageNumber), {
      x: COLS[4].x + 4, y: y + 4, font: regular, size: 9, color: GRAY,
    })

    // Row separator
    tocPage.drawLine({
      start: { x: 36, y: rowY },
      end: { x: TABLE_RIGHT, y: rowY },
      thickness: 0.25,
      color: LIGHT_GRAY,
    })

    // PDF GoTo link annotation — clicking anywhere on the row jumps to the divider page
    const linkAnnot = pdfDoc.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Link'),
      Rect: pdfDoc.context.obj([36, rowY, TABLE_RIGHT, rowTop]),
      Border: pdfDoc.context.obj([0, 0, 0]),
      Dest: pdfDoc.context.obj([e.pageRef, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull]),
    })
    annotRefs.push(pdfDoc.context.register(linkAnnot))

    y -= ROW_H
    if (y < 60) break // safety guard — reasonable submittal won't overflow one TOC page
  }

  // Attach all annotations to the TOC page
  if (annotRefs.length > 0) {
    tocPage.node.set(PDFName.of('Annots'), pdfDoc.context.obj(annotRefs))
  }
}
