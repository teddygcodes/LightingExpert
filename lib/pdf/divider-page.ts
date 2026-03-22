import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib'

const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.42, 0.42, 0.42)
const LIGHT_GRAY = rgb(0.92, 0.92, 0.92)

export interface DividerPageOptions {
  type: string
  manufacturer: string
  catalogNumber: string
  qty: number
  location: string
}

export function buildFixtureDividerPage(
  pdfDoc: PDFDocument,
  opts: DividerPageOptions,
  fonts: { regular: PDFFont; bold: PDFFont }
): PDFPage {
  const page = pdfDoc.addPage([612, 792])
  const { width, height } = page.getSize()
  const { regular, bold } = fonts

  // Background
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.97, 0.97, 0.97) })

  // ── Large type letter ──────────────────────────────────────────────
  const typeLabel = `FIXTURE TYPE ${opts.type}`
  const typeSize = 72
  const typeLabelW = bold.widthOfTextAtSize(typeLabel, typeSize)
  page.drawText(typeLabel, {
    x: (width - typeLabelW) / 2,
    y: height / 2 + 20,
    font: bold,
    size: typeSize,
    color: BLACK,
  })

  // ── Thin divider line ─────────────────────────────────────────────
  page.drawLine({
    start: { x: 80, y: height / 2 - 10 },
    end: { x: width - 80, y: height / 2 - 10 },
    thickness: 0.5,
    color: LIGHT_GRAY,
  })

  // ── Product details ───────────────────────────────────────────────
  const detailRows: [string, string][] = [
    ['Manufacturer', opts.manufacturer],
    ['Catalog Number', opts.catalogNumber],
    ['Quantity', String(opts.qty)],
    ['Location', opts.location || '—'],
  ]

  let y = height / 2 - 40
  const labelX = 120
  const valueX = 260

  for (const [label, value] of detailRows) {
    page.drawText(label, { x: labelX, y, font: bold, size: 11, color: GRAY })
    page.drawText(value, { x: valueX, y, font: regular, size: 11, color: BLACK })
    y -= 24
  }

  return page
}
