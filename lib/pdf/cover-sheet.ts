import { PDFDocument, PDFFont, rgb } from 'pdf-lib'
import * as fs from 'fs'
import * as path from 'path'

const BLACK = rgb(0, 0, 0)
const DARK = rgb(0.1, 0.1, 0.1)
const GRAY = rgb(0.42, 0.42, 0.42)
const LIGHT_GRAY = rgb(0.92, 0.92, 0.92)

const LOGO_ZONE_H = 120
const LOGO_ZONE_Y = 792 - LOGO_ZONE_H  // 672

export interface CoverSheetData {
  projectName: string
  projectAddress?: string | null
  clientName?: string | null
  contractorName?: string | null
  preparedBy?: string | null
  date: string
  revisionNumber: number
}

export async function buildCoverSheet(
  pdfDoc: PDFDocument,
  data: CoverSheetData,
  fonts: { regular: PDFFont; bold: PDFFont },
  showBranding = true
): Promise<void> {
  const page = pdfDoc.addPage([612, 792])
  const { width } = page.getSize()
  const { regular, bold } = fonts

  // ── Logo zone ─────────────────────────────────────────────────────
  const logoPaths = [
    path.join(process.cwd(), 'public', 'atlantiskb-logo.png'),
    path.join(process.cwd(), 'public', 'atlantiskb-logo.jpg'),
  ]
  let logoEmbedded = false
  for (const logoPath of logoPaths) {
    if (!fs.existsSync(logoPath)) continue
    try {
      const logoBytes = fs.readFileSync(logoPath)
      const logoImage = logoPath.endsWith('.png')
        ? await pdfDoc.embedPng(logoBytes)
        : await pdfDoc.embedJpg(logoBytes)
      const maxH = LOGO_ZONE_H - 20   // 10pt padding top + bottom
      const maxW = 540                 // content width (36pt margins each side)
      const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height)
      const imgW = logoImage.width * scale
      const imgH = logoImage.height * scale
      page.drawImage(logoImage, {
        x: (width - imgW) / 2,
        y: LOGO_ZONE_Y + (LOGO_ZONE_H - imgH) / 2,
        width: imgW,
        height: imgH,
      })
      logoEmbedded = true
      break
    } catch { /* fall through to text fallback */ }
  }

  if (!logoEmbedded) {
    const brand = 'ATLANTIS KB'
    const brandW = bold.widthOfTextAtSize(brand, 28)
    page.drawText(brand, {
      x: (width - brandW) / 2,
      y: LOGO_ZONE_Y + (LOGO_ZONE_H - 28) / 2,
      font: bold,
      size: 28,
      color: BLACK,
    })
  }

  // Bold dark rule below logo zone
  page.drawLine({
    start: { x: 36, y: LOGO_ZONE_Y },
    end: { x: width - 36, y: LOGO_ZONE_Y },
    thickness: 2,
    color: DARK,
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

  // ── Signature lines ───────────────────────────────────────────────
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
