import { PDFDocument, PDFFont, rgb } from 'pdf-lib'
import { PDF_COLORS, MARGINS } from './layout-constants'

const { BLACK, DARK, GRAY, ACCENT } = PDF_COLORS
const FAINT_GRAY = rgb(0.75, 0.75, 0.75)
const RULE_GRAY  = rgb(0.80, 0.80, 0.80)
const WHITE      = rgb(1, 1, 1)

export interface CoverSheetData {
  projectName: string
  projectAddress?: string | null
  clientName?: string | null
  contractorName?: string | null
  preparedBy?: string | null
  preparedFor?: string | null
  date: string
  revisionNumber: number
  companyName?: string | null
  companyAddress?: string | null
  companyPhone?: string | null
  companyEmail?: string | null
  companyWebsite?: string | null
  logoBase64?: string | null
  logoMimeType?: string | null
  preparedByName?: string | null
  preparedByTitle?: string | null
  preparedByPhone?: string | null
  preparedByEmail?: string | null
}

function drawCentered(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  pageWidth: number,
) {
  const w = font.widthOfTextAtSize(text, size)
  const x = Math.max(MARGINS.SIDE, (pageWidth - w) / 2)
  page.drawText(text, { x, y, font, size, color })
  return w
}

export async function buildCoverSheet(
  pdfDoc: PDFDocument,
  data: CoverSheetData,
  fonts: { regular: PDFFont; bold: PDFFont },
): Promise<void> {
  const page = pdfDoc.addPage([612, 792])
  const { width } = page.getSize()
  const { regular, bold } = fonts
  const SIDE = MARGINS.SIDE

  // ─────────────────────────────────────────────────────────────────────
  // TOP ACCENT BAR
  // ─────────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 792 - 4, width, height: 4, color: ACCENT })

  // ─────────────────────────────────────────────────────────────────────
  // UNIFIED HERO HEADER — logo, company, title as one centered column
  // ─────────────────────────────────────────────────────────────────────
  const LOGO_MAX_W = 300
  const LOGO_MAX_H = 140
  let curY = 740

  // Logo — large, centered, hero element
  if (data.logoBase64) {
    try {
      const b64 = data.logoBase64.replace(/^data:[^;]+;base64,/, '')
      const imgBytes = Buffer.from(b64, 'base64')
      const isPng = (data.logoMimeType ?? '').includes('png')
      const img = isPng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)
      const scale = Math.min(LOGO_MAX_W / img.width, LOGO_MAX_H / img.height)
      const imgW = img.width * scale
      const imgH = img.height * scale
      const imgX = (width - imgW) / 2
      curY -= imgH
      page.drawImage(img, { x: imgX, y: curY, width: imgW, height: imgH })
      curY -= 16
    } catch { /* skip */ }
  }

  // Company name — 30pt bold, dark, centered
  if (data.companyName) {
    const nameSize = 30
    const nameW = bold.widthOfTextAtSize(data.companyName, nameSize)
    page.drawText(data.companyName, {
      x: (width - nameW) / 2,
      y: curY,
      font: bold,
      size: nameSize,
      color: DARK,
    })
    curY -= nameSize + 8
  }

  // Contact line — 10pt, gray, centered, dot-separated
  const contactParts = [data.companyAddress, data.companyPhone, data.companyEmail, data.companyWebsite].filter(Boolean) as string[]
  if (contactParts.length > 0) {
    const contactLine = contactParts.join('  ·  ')
    const contactW = regular.widthOfTextAtSize(contactLine, 10)
    page.drawText(contactLine, {
      x: (width - contactW) / 2,
      y: curY,
      font: regular,
      size: 10,
      color: GRAY,
    })
    curY -= 22
  }

  // Thin rule separator
  page.drawLine({
    start: { x: SIDE, y: curY },
    end: { x: width - SIDE, y: curY },
    thickness: 0.5,
    color: RULE_GRAY,
  })
  curY -= 24

  // "LIGHTING SUBMITTAL" — 24pt bold dark text, centered
  const titleText = 'LIGHTING SUBMITTAL'
  const titleSize = 24
  const titleW = bold.widthOfTextAtSize(titleText, titleSize)
  page.drawText(titleText, {
    x: (width - titleW) / 2,
    y: curY,
    font: bold,
    size: titleSize,
    color: DARK,
  })
  curY -= titleSize + 6

  // Red accent underline below title (matches TOC style)
  const underlineW = 40
  page.drawRectangle({
    x: (width - underlineW) / 2,
    y: curY,
    width: underlineW,
    height: 2,
    color: ACCENT,
  })

  // ─────────────────────────────────────────────────────────────────────
  // PROJECT INFO — two-column layout below title band
  // ─────────────────────────────────────────────────────────────────────
  const BASE_Y    = curY - 30
  const CENTER_X  = width / 2
  const RIGHT_X   = CENTER_X + 50
  const LEFT_X    = CENTER_X - 16 - 160 // mirror RIGHT_X gap, left-anchored for ~160pt text block
  const LINE_SM   = 14
  const LINE_MD   = 20

  // ── Left column: project details ────────────────────────────────────
  let ly = BASE_Y

  page.drawText(data.projectName, { x: LEFT_X, y: ly, font: bold, size: 16, color: DARK })
  ly -= LINE_MD + 2

  if (data.projectAddress) {
    page.drawText(data.projectAddress, { x: LEFT_X, y: ly, font: regular, size: 10, color: DARK })
    ly -= LINE_SM
  }

  if (data.clientName) {
    page.drawText(`Client: ${data.clientName}`, { x: LEFT_X, y: ly, font: regular, size: 10, color: DARK })
    ly -= LINE_SM
  }

  if (data.contractorName) {
    page.drawText(`Contractor: ${data.contractorName}`, { x: LEFT_X, y: ly, font: regular, size: 10, color: DARK })
    ly -= LINE_SM
  }

  ly -= 4
  const revStr = `Rev ${String(data.revisionNumber).padStart(2, '0')}`
  page.drawText(`${data.date}  ·  ${revStr}`, { x: LEFT_X, y: ly, font: regular, size: 10, color: GRAY })

  // ── Vertical divider ────────────────────────────────────────────────
  const hasPreparedBy = !!(data.preparedByName || data.preparedByTitle || data.preparedByPhone || data.preparedByEmail)

  if (hasPreparedBy) {
    page.drawLine({
      start: { x: CENTER_X - 4, y: BASE_Y + 12 },
      end: { x: CENTER_X - 4, y: Math.min(ly, BASE_Y - 80) },
      thickness: 0.5,
      color: RULE_GRAY,
    })

    // ── Right column: prepared by ───────────────────────────────────────
    let ry = BASE_Y

    // Small red accent dash
    page.drawRectangle({ x: RIGHT_X, y: ry + 12, width: 20, height: 2, color: ACCENT })

    page.drawText('PREPARED BY', { x: RIGHT_X, y: ry, font: bold, size: 8, color: GRAY })
    ry -= 16

    if (data.preparedByName) {
      page.drawText(data.preparedByName, { x: RIGHT_X, y: ry, font: bold, size: 13, color: DARK })
      ry -= LINE_MD
    }

    for (const line of [data.preparedByTitle, data.preparedByPhone, data.preparedByEmail]) {
      if (!line) continue
      page.drawText(line, { x: RIGHT_X, y: ry, font: regular, size: 9, color: GRAY })
      ry -= LINE_SM
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // FOOTER — bottom accent line + branding
  // ─────────────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0, y: 0, width, height: 3,
    color: ACCENT,
  })

  const brand  = 'Prepared with Atlantis KB'
  const brandW = regular.widthOfTextAtSize(brand, 7)
  page.drawText(brand, {
    x: (width - brandW) / 2,
    y: 10,
    font: regular,
    size: 7,
    color: FAINT_GRAY,
  })
}
