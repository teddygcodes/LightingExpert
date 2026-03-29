import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib'
import { PAGE, MARGINS, TABLE, PDF_COLORS } from './layout-constants'

const { BLACK, DARK, LIGHT_GRAY } = PDF_COLORS

export interface ScheduleRow {
  type: string
  qty: number
  manufacturer: string
  catalogNumber: string
  watts: string
  lumens: string
  cct: string
  voltage: string
  location: string
}

// Portrait letter (612 × 792)
// 9 columns, full-width grid, margins 36 each side → usable width 540
const COLS = [
  { label: 'TYPE',      key: 'type',         x: 36,  w: 36  },
  { label: 'QTY',       key: 'qty',          x: 72,  w: 32  },
  { label: 'MANUFACTURER', key: 'manufacturer', x: 104, w: 108 },
  { label: 'CATALOG #', key: 'catalogNumber', x: 212, w: 128 },
  { label: 'WATTS',     key: 'watts',        x: 340, w: 48  },
  { label: 'LUMENS',    key: 'lumens',       x: 388, w: 52  },
  { label: 'CCT',       key: 'cct',          x: 440, w: 44  },
  { label: 'VOLTAGE',   key: 'voltage',      x: 484, w: 44  },
  { label: 'LOCATION',  key: 'location',     x: 528, w: 84  }, // extends to 612
] as const

const PAGE_W = PAGE.LETTER_W
const PAGE_H = PAGE.LETTER_H
const MARGIN_TOP = MARGINS.TOP_USABLE
const MARGIN_BOTTOM = MARGINS.BOTTOM_USABLE
const HEADER_H = TABLE.HEADER_ROW_H
const ROW_H = TABLE.ROW_H
const TABLE_LEFT = TABLE.LEFT
const TABLE_RIGHT = TABLE.RIGHT

function truncate(s: string, maxChars: number): string {
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s
}

function drawTableHeader(page: PDFPage, y: number, bold: PDFFont): void {
  page.drawRectangle({
    x: TABLE_LEFT,
    y: y - 4,
    width: TABLE_RIGHT - TABLE_LEFT,
    height: HEADER_H,
    color: DARK,
  })
  for (const col of COLS) {
    const maxChars = Math.max(3, Math.floor(col.w / 5.5))
    page.drawText(truncate(col.label, maxChars), {
      x: col.x + 3,
      y: y + 4,
      font: bold,
      size: 8,
      color: rgb(1, 1, 1),
    })
  }
}

function drawGridLines(page: PDFPage, y: number): void {
  // Horizontal bottom rule for this row
  page.drawLine({
    start: { x: TABLE_LEFT, y: y - 4 },
    end: { x: TABLE_RIGHT, y: y - 4 },
    thickness: 0.25,
    color: LIGHT_GRAY,
  })
  // Vertical column dividers
  for (let i = 1; i < COLS.length; i++) {
    page.drawLine({
      start: { x: COLS[i].x, y: y - 4 },
      end: { x: COLS[i].x, y: y + ROW_H - 4 },
      thickness: 0.25,
      color: LIGHT_GRAY,
    })
  }
}

export function buildFixtureSchedule(
  pdfDoc: PDFDocument,
  rows: ScheduleRow[],
  fonts: { regular: PDFFont; bold: PDFFont }
): PDFPage[] {
  const { regular, bold } = fonts
  const pages: PDFPage[] = []

  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  pages.push(page)

  let y = MARGIN_TOP
  drawTableHeader(page, y, bold)
  y -= HEADER_H

  // Outer border top
  page.drawLine({
    start: { x: TABLE_LEFT, y: MARGIN_TOP + HEADER_H - 4 },
    end: { x: TABLE_RIGHT, y: MARGIN_TOP + HEADER_H - 4 },
    thickness: 0.5,
    color: BLACK,
  })

  for (let i = 0; i < rows.length; i++) {
    // New page if needed
    if (y - ROW_H < MARGIN_BOTTOM) {
      // Close border on current page
      page.drawLine({
        start: { x: TABLE_LEFT, y: y + ROW_H - 4 },
        end: { x: TABLE_RIGHT, y: y + ROW_H - 4 },
        thickness: 0.5,
        color: BLACK,
      })

      page = pdfDoc.addPage([PAGE_W, PAGE_H])
      pages.push(page)
      y = MARGIN_TOP
      drawTableHeader(page, y, bold)
      y -= HEADER_H

      page.drawLine({
        start: { x: TABLE_LEFT, y: MARGIN_TOP + HEADER_H - 4 },
        end: { x: TABLE_RIGHT, y: MARGIN_TOP + HEADER_H - 4 },
        thickness: 0.5,
        color: BLACK,
      })
    }

    const row = rows[i]

    // Alternating row background
    if (i % 2 === 0) {
      page.drawRectangle({
        x: TABLE_LEFT,
        y: y - 4,
        width: TABLE_RIGHT - TABLE_LEFT,
        height: ROW_H,
        color: LIGHT_GRAY,
      })
    }

    // Row data
    const rowData: Record<string, string> = {
      type: row.type,
      qty: String(row.qty),
      manufacturer: row.manufacturer,
      catalogNumber: row.catalogNumber,
      watts: row.watts,
      lumens: row.lumens,
      cct: row.cct,
      voltage: row.voltage,
      location: row.location,
    }

    for (const col of COLS) {
      const val = rowData[col.key] ?? ''
      const maxChars = Math.max(2, Math.floor(col.w / 5.2))
      page.drawText(truncate(val, maxChars), {
        x: col.x + 3,
        y: y + 3,
        font: regular,
        size: 8,
        color: BLACK,
      })
    }

    drawGridLines(page, y)
    y -= ROW_H
  }

  // Close border on last page
  page.drawLine({
    start: { x: TABLE_LEFT, y: y + ROW_H - 4 },
    end: { x: TABLE_RIGHT, y: y + ROW_H - 4 },
    thickness: 0.5,
    color: BLACK,
  })

  // Left and right outer borders on all pages
  for (const p of pages) {
    const topY = MARGIN_TOP + HEADER_H - 4
    const botY = MARGIN_BOTTOM
    page.drawLine({ start: { x: TABLE_LEFT, y: topY }, end: { x: TABLE_LEFT, y: botY }, thickness: 0.5, color: BLACK })
    page.drawLine({ start: { x: TABLE_RIGHT, y: topY }, end: { x: TABLE_RIGHT, y: botY }, thickness: 0.5, color: BLACK })
  }

  return pages
}
