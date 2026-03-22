import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib'

const GRAY = rgb(0.42, 0.42, 0.42)
const LIGHT_GRAY = rgb(0.90, 0.90, 0.90)
const RED = rgb(0.72, 0.18, 0.18)

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

  // Background card
  page.drawRectangle({
    x: 80,
    y: centerY - 60,
    width: width - 160,
    height: 120,
    color: LIGHT_GRAY,
  })

  // "SPEC SHEET NOT AVAILABLE"
  const heading = 'SPEC SHEET NOT AVAILABLE'
  const headingW = bold.widthOfTextAtSize(heading, 14)
  page.drawText(heading, {
    x: centerX - headingW / 2,
    y: centerY + 26,
    font: bold,
    size: 14,
    color: RED,
  })

  // Catalog number
  const catLabel = catalogNumber
  const catLabelW = bold.widthOfTextAtSize(catLabel, 11)
  page.drawText(catLabel, {
    x: centerX - catLabelW / 2,
    y: centerY + 4,
    font: bold,
    size: 11,
    color: rgb(0.1, 0.1, 0.1),
  })

  // Reason
  const reasonText = `Reason: ${reason}`
  const reasonW = regular.widthOfTextAtSize(reasonText, 9)
  page.drawText(reasonText, {
    x: centerX - reasonW / 2,
    y: centerY - 20,
    font: regular,
    size: 9,
    color: GRAY,
  })

  // Instruction
  const instruction = 'Attach the manufacturer spec sheet manually to this submittal.'
  const instructionW = regular.widthOfTextAtSize(instruction, 8)
  page.drawText(instruction, {
    x: centerX - instructionW / 2,
    y: centerY - 40,
    font: regular,
    size: 8,
    color: GRAY,
  })

  return page
}
