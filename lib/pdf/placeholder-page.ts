import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib'
import { PDF_COLORS } from './layout-constants'

const { GRAY, ACCENT, LIGHT_GRAY } = PDF_COLORS
const DARK = rgb(0.1, 0.1, 0.1)

export function buildMissingSpecSheetPage(
  pdfDoc: PDFDocument,
  catalogNumber: string,
  reason: string,
  fonts: { regular: PDFFont; bold: PDFFont }
): PDFPage {
  const page = pdfDoc.addPage([612, 792])
  const { width, height } = page.getSize()
  const { regular, bold } = fonts

  const centerX = width / 2
  const centerY = height / 2

  // Background card with subtle border
  const cardW = width - 120
  const cardH = 160
  const cardX = (width - cardW) / 2
  const cardY = centerY - cardH / 2

  page.drawRectangle({
    x: cardX, y: cardY, width: cardW, height: cardH,
    color: rgb(0.98, 0.97, 0.96), // warm off-white
  })

  // Left accent bar on card
  page.drawRectangle({
    x: cardX, y: cardY, width: 3, height: cardH,
    color: ACCENT,
  })

  // Border around card
  page.drawRectangle({
    x: cardX, y: cardY, width: cardW, height: cardH,
    borderColor: LIGHT_GRAY,
    borderWidth: 0.5,
  })

  // Document icon (simple SVG-style drawing)
  const iconX = centerX - 12
  const iconY = centerY + 36
  // Page outline
  page.drawRectangle({
    x: iconX, y: iconY, width: 20, height: 26,
    borderColor: GRAY,
    borderWidth: 1,
  })
  // Folded corner
  page.drawLine({ start: { x: iconX + 14, y: iconY + 26 }, end: { x: iconX + 20, y: iconY + 20 }, thickness: 1, color: GRAY })
  page.drawLine({ start: { x: iconX + 14, y: iconY + 26 }, end: { x: iconX + 14, y: iconY + 20 }, thickness: 1, color: GRAY })
  page.drawLine({ start: { x: iconX + 14, y: iconY + 20 }, end: { x: iconX + 20, y: iconY + 20 }, thickness: 1, color: GRAY })
  // X mark on page
  page.drawLine({ start: { x: iconX + 6, y: iconY + 14 }, end: { x: iconX + 14, y: iconY + 6 }, thickness: 1, color: ACCENT })
  page.drawLine({ start: { x: iconX + 14, y: iconY + 14 }, end: { x: iconX + 6, y: iconY + 6 }, thickness: 1, color: ACCENT })

  // "SPEC SHEET NOT AVAILABLE"
  const heading = 'SPEC SHEET NOT AVAILABLE'
  const headingW = bold.widthOfTextAtSize(heading, 12)
  page.drawText(heading, {
    x: centerX - headingW / 2,
    y: centerY + 12,
    font: bold,
    size: 12,
    color: DARK,
  })

  // Catalog number
  const catLabel = catalogNumber
  const catLabelW = bold.widthOfTextAtSize(catLabel, 11)
  page.drawText(catLabel, {
    x: centerX - catLabelW / 2,
    y: centerY - 8,
    font: bold,
    size: 11,
    color: ACCENT,
  })

  // Reason
  const reasonText = reason
  const reasonW = regular.widthOfTextAtSize(reasonText, 9)
  page.drawText(reasonText, {
    x: centerX - reasonW / 2,
    y: centerY - 28,
    font: regular,
    size: 9,
    color: GRAY,
  })

  // Instruction
  const instruction = 'Attach the manufacturer spec sheet manually to this submittal.'
  const instructionW = regular.widthOfTextAtSize(instruction, 8)
  page.drawText(instruction, {
    x: centerX - instructionW / 2,
    y: centerY - 48,
    font: regular,
    size: 8,
    color: GRAY,
  })

  return page
}
