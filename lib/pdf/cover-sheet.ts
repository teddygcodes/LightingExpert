import { PDFDocument, PDFFont, rgb } from 'pdf-lib'

const BLACK = rgb(0, 0, 0)
const DARK = rgb(0.1, 0.1, 0.1)
const GRAY = rgb(0.42, 0.42, 0.42)
const LIGHT_GRAY = rgb(0.92, 0.92, 0.92)

export interface CoverSheetData {
  projectName: string
  projectAddress?: string | null
  clientName?: string | null
  contractorName?: string | null
  preparedBy?: string | null
  date: string
  revisionNumber: number
}

export function buildCoverSheet(
  pdfDoc: PDFDocument,
  data: CoverSheetData,
  fonts: { regular: PDFFont; bold: PDFFont },
  showBranding = true
): void {
  const page = pdfDoc.addPage([612, 792])
  const { width } = page.getSize()
  const { regular, bold } = fonts

  // ── Logo placeholder ──────────────────────────────────────────────
  const logoW = 200
  const logoH = 80
  const logoX = (width - logoW) / 2
  const logoY = 668

  page.drawRectangle({
    x: logoX,
    y: logoY,
    width: logoW,
    height: logoH,
    borderColor: LIGHT_GRAY,
    borderWidth: 1,
    color: rgb(0.97, 0.97, 0.97),
  })

  const logoLabel = 'COMPANY NAME'
  const logoLabelW = bold.widthOfTextAtSize(logoLabel, 11)
  page.drawText(logoLabel, {
    x: logoX + (logoW - logoLabelW) / 2,
    y: logoY + logoH / 2 - 6,
    font: bold,
    size: 11,
    color: GRAY,
  })

  // ── Title ─────────────────────────────────────────────────────────
  const title = 'LIGHTING SUBMITTAL'
  const titleW = bold.widthOfTextAtSize(title, 22)
  page.drawText(title, {
    x: (width - titleW) / 2,
    y: 628,
    font: bold,
    size: 22,
    color: BLACK,
  })

  page.drawLine({
    start: { x: 36, y: 614 },
    end: { x: width - 36, y: 614 },
    thickness: 0.5,
    color: LIGHT_GRAY,
  })

  // ── Project info table ────────────────────────────────────────────
  const revStr = String(data.revisionNumber).padStart(2, '0')
  const infoRows: [string, string][] = [
    ['PROJECT NAME', data.projectName],
    ['PROJECT ADDRESS', data.projectAddress || '—'],
    ['CLIENT', data.clientName || '—'],
    ['CONTRACTOR', data.contractorName || '—'],
    ['PREPARED BY', data.preparedBy || '—'],
    ['DATE', data.date],
    ['REVISION', `Rev ${revStr}`],
  ]

  const labelX = 36
  const valueX = 190
  const rowH = 26
  let y = 602

  for (const [label, value] of infoRows) {
    page.drawRectangle({ x: 36, y: y - 5, width: 540, height: rowH, color: LIGHT_GRAY })
    page.drawText(label, { x: labelX + 6, y: y + 6, font: bold, size: 9, color: DARK })
    page.drawText(value, { x: valueX, y: y + 6, font: regular, size: 9, color: BLACK })
    y -= rowH + 2
  }

  // ── Approval block ────────────────────────────────────────────────
  y -= 24
  page.drawText('APPROVAL STATUS', { x: 36, y, font: bold, size: 10, color: BLACK })
  y -= 18

  page.drawRectangle({ x: 36, y: y - 42, width: 540, height: 58, color: LIGHT_GRAY })

  const approvalOptions = ['APPROVED', 'APPROVED AS NOTED', 'REVISE AND RESUBMIT', 'REJECTED']
  const colW = 135
  for (let i = 0; i < approvalOptions.length; i++) {
    const ax = 44 + i * colW
    // Checkbox square
    page.drawRectangle({
      x: ax,
      y: y - 10,
      width: 10,
      height: 10,
      borderColor: DARK,
      borderWidth: 0.8,
      color: rgb(1, 1, 1),
    })
    page.drawText(approvalOptions[i], {
      x: ax + 14,
      y: y - 7,
      font: regular,
      size: 8,
      color: BLACK,
    })
  }

  // ── Signature lines ────────────────────────────────────────────────
  y -= 70
  page.drawLine({ start: { x: 36, y }, end: { x: 260, y }, thickness: 0.5, color: DARK })
  page.drawLine({ start: { x: 290, y }, end: { x: 576, y }, thickness: 0.5, color: DARK })
  y -= 14
  page.drawText('Signature', { x: 36, y, font: regular, size: 8, color: GRAY })
  page.drawText('Date', { x: 290, y, font: regular, size: 8, color: GRAY })

  // ── Branding ──────────────────────────────────────────────────────
  if (showBranding) {
    const brand = 'Prepared with Atlantis KB'
    const brandW = regular.widthOfTextAtSize(brand, 8)
    page.drawText(brand, {
      x: (width - brandW) / 2,
      y: 20,
      font: regular,
      size: 8,
      color: LIGHT_GRAY,
    })
  }
}
