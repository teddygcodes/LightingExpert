import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib'

export interface ScheduleRow {
  type: string
  qty: number
  manufacturer: string
  catalogNumber: string
  description: string
  watts: string
  lumens: string
  cct: string
  cri: string
  voltage: string
  ipNema: string
  mounting: string
  location: string
  notes: string
}

const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.42, 0.42, 0.42)
const LIGHT_GRAY = rgb(0.95, 0.95, 0.95)
const RED = rgb(0.82, 0.20, 0.22)

const COLS = [
  { label: 'TYPE', x: 20, w: 28 },
  { label: 'QTY', x: 50, w: 24 },
  { label: 'MFR', x: 76, w: 54 },
  { label: 'CATALOG #', x: 132, w: 80 },
  { label: 'DESCRIPTION', x: 214, w: 90 },
  { label: 'W', x: 306, w: 28 },
  { label: 'LM', x: 336, w: 38 },
  { label: 'CCT', x: 376, w: 36 },
  { label: 'CRI', x: 414, w: 24 },
  { label: 'V', x: 440, w: 36 },
  { label: 'IP/NEMA', x: 478, w: 42 },
  { label: 'MNT', x: 522, w: 32 },
  { label: 'LOCATION', x: 556, w: 56 },
]

function drawHeader(page: PDFPage, bold: ReturnType<PDFDocument['embedFont']> extends Promise<infer R> ? R : never, y: number, pageNum: number) {
  page.drawRectangle({ x: 10, y: y - 2, width: 790, height: 16, color: rgb(0.1, 0.1, 0.1) })
  for (const col of COLS) {
    page.drawText(col.label, { x: col.x, y, font: bold, size: 7, color: rgb(1, 1, 1) })
  }
  page.drawText(`FIXTURE SCHEDULE — Page ${pageNum}`, { x: 620, y, font: bold, size: 7, color: rgb(0.7, 0.7, 0.7) })
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export async function buildFixtureSchedule(
  doc: PDFDocument,
  rows: ScheduleRow[]
): Promise<void> {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)

  // Landscape letter: 792 x 612
  const PAGE_W = 792
  const PAGE_H = 612
  const ROW_H = 14
  const HEADER_H = 18
  const MARGIN_TOP = 580
  const MARGIN_BOTTOM = 30

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = MARGIN_TOP
  let pageNum = 2 // page 1 is cover sheet

  drawHeader(page, bold, y, pageNum)
  y -= HEADER_H

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    // New page if needed
    if (y < MARGIN_BOTTOM + ROW_H) {
      // Footer
      page.drawLine({ start: { x: 10, y: 20 }, end: { x: 782, y: 20 }, thickness: 0.5, color: LIGHT_GRAY })
      page.drawText('Atlantis KB — Lighting Expert', { x: 10, y: 8, font: regular, size: 7, color: GRAY })

      page = doc.addPage([PAGE_W, PAGE_H])
      pageNum++
      y = MARGIN_TOP
      drawHeader(page, bold, y, pageNum)
      y -= HEADER_H
    }

    // Alternating row background
    if (i % 2 === 0) {
      page.drawRectangle({ x: 10, y: y - 2, width: 782, height: ROW_H, color: LIGHT_GRAY })
    }

    const rowData: Record<string, string> = {
      type: row.type,
      qty: String(row.qty),
      manufacturer: row.manufacturer,
      catalogNumber: row.catalogNumber,
      description: row.description,
      watts: row.watts,
      lumens: row.lumens,
      cct: row.cct,
      cri: row.cri,
      voltage: row.voltage,
      ipNema: row.ipNema,
      mounting: row.mounting,
      location: row.location,
    }

    const colKeys = ['type','qty','manufacturer','catalogNumber','description','watts','lumens','cct','cri','voltage','ipNema','mounting','location']

    COLS.forEach((col, idx) => {
      const val = rowData[colKeys[idx]] || ''
      const maxChars = Math.floor(col.w / 5)
      page.drawText(truncate(val, maxChars), { x: col.x, y, font: regular, size: 7, color: BLACK })
    })

    y -= ROW_H
  }

  // Final footer
  page.drawLine({ start: { x: 10, y: 20 }, end: { x: 782, y: 20 }, thickness: 0.5, color: LIGHT_GRAY })
  page.drawText('Atlantis KB — Lighting Expert', { x: 10, y: 8, font: regular, size: 7, color: GRAY })
}
