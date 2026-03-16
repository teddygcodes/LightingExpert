import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib'

export interface CoverSheetData {
  projectName: string
  projectAddress?: string | null
  clientName?: string | null
  contractorName?: string | null
  preparedBy?: string | null
  date: string
  revisionNumber: number
  fixtures: Array<{ type: string; manufacturer: string; catalogNumber: string; description: string; qty: number }>
  missingDocuments: string[]
}

const RED = rgb(0.82, 0.20, 0.22)
const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.42, 0.42, 0.42)
const LIGHT_GRAY = rgb(0.95, 0.95, 0.95)

export async function buildCoverSheet(doc: PDFDocument, data: CoverSheetData): Promise<PDFPage> {
  const page = doc.addPage([612, 792]) // US Letter
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)

  let y = 750

  // Header bar
  page.drawRectangle({ x: 0, y: y - 10, width: 612, height: 44, color: rgb(0.1, 0.1, 0.1) })
  page.drawText('LIGHTING SUBMITTAL', { x: 36, y: y + 2, font: bold, size: 18, color: rgb(1, 1, 1) })
  page.drawText('Atlantis KB', { x: 500, y: y + 2, font: bold, size: 11, color: RED })
  y -= 60

  // Project info block
  const infoRows = [
    ['Project:', data.projectName],
    ['Address:', data.projectAddress || '—'],
    ['Client:', data.clientName || '—'],
    ['Contractor:', data.contractorName || '—'],
    ['Prepared by:', data.preparedBy || '—'],
    ['Date:', data.date],
    ['Revision:', `Rev ${data.revisionNumber}`],
  ]

  for (const [label, value] of infoRows) {
    page.drawText(label, { x: 36, y, font: bold, size: 10, color: GRAY })
    page.drawText(value, { x: 130, y, font: regular, size: 10, color: BLACK })
    y -= 16
  }

  y -= 16

  // Fixture summary table header
  page.drawRectangle({ x: 36, y: y - 2, width: 540, height: 18, color: LIGHT_GRAY })
  page.drawText('TYPE', { x: 40, y, font: bold, size: 9, color: BLACK })
  page.drawText('MANUFACTURER', { x: 80, y, font: bold, size: 9, color: BLACK })
  page.drawText('CATALOG NUMBER', { x: 200, y, font: bold, size: 9, color: BLACK })
  page.drawText('DESCRIPTION', { x: 340, y, font: bold, size: 9, color: BLACK })
  page.drawText('QTY', { x: 540, y, font: bold, size: 9, color: BLACK })
  y -= 18

  for (const f of data.fixtures) {
    page.drawLine({ start: { x: 36, y: y + 12 }, end: { x: 576, y: y + 12 }, thickness: 0.5, color: LIGHT_GRAY })
    page.drawText(f.type, { x: 40, y, font: regular, size: 9, color: BLACK })
    page.drawText(f.manufacturer.slice(0, 14), { x: 80, y, font: regular, size: 9, color: BLACK })
    page.drawText(f.catalogNumber.slice(0, 18), { x: 200, y, font: regular, size: 9, color: BLACK })
    page.drawText(f.description.slice(0, 26), { x: 340, y, font: regular, size: 9, color: BLACK })
    page.drawText(String(f.qty), { x: 540, y, font: regular, size: 9, color: BLACK })
    y -= 16
    if (y < 250) break
  }

  y -= 24

  // Missing documents warning
  if (data.missingDocuments.length > 0) {
    page.drawRectangle({ x: 36, y: y - 4, width: 540, height: 20, color: rgb(1, 0.97, 0.9) })
    page.drawText(`MISSING DOCUMENTS: ${data.missingDocuments.join(', ')}`, {
      x: 40, y, font: bold, size: 9, color: rgb(0.8, 0.4, 0),
    })
    y -= 30
  }

  // Approval block
  y = Math.min(y, 220)
  page.drawRectangle({ x: 36, y: y - 60, width: 540, height: 80, color: LIGHT_GRAY })
  page.drawText('APPROVAL', { x: 40, y: y + 8, font: bold, size: 10, color: BLACK })
  const approvalOptions = ['APPROVED', 'APPROVED AS NOTED', 'REVISE & RESUBMIT', 'REJECTED']
  let ax = 40
  for (const opt of approvalOptions) {
    // Draw checkbox as a small rectangle
    page.drawRectangle({ x: ax, y: y - 14, width: 8, height: 8, borderColor: BLACK, borderWidth: 0.8, color: rgb(1,1,1) })
    page.drawText(opt, { x: ax + 12, y: y - 10, font: regular, size: 9, color: BLACK })
    ax += 130
  }
  page.drawLine({ start: { x: 40, y: y - 38 }, end: { x: 280, y: y - 38 }, thickness: 0.5, color: GRAY })
  page.drawText('Signature / Date', { x: 40, y: y - 52, font: regular, size: 8, color: GRAY })

  // Footer
  page.drawLine({ start: { x: 36, y: 36 }, end: { x: 576, y: 36 }, thickness: 0.5, color: LIGHT_GRAY })
  page.drawText('Prepared with Atlantis KB — Lighting Expert', { x: 36, y: 20, font: regular, size: 8, color: GRAY })
  page.drawText(`Page 1`, { x: 540, y: 20, font: regular, size: 8, color: GRAY })

  return page
}
