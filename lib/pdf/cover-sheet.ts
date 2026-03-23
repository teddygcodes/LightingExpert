import { PDFDocument, PDFFont, rgb } from 'pdf-lib'

const BLACK      = rgb(0,    0,    0   )
const DARK       = rgb(0.1,  0.1,  0.1 )
const GRAY       = rgb(0.45, 0.45, 0.45)
const FAINT_GRAY = rgb(0.75, 0.75, 0.75)

export interface CoverSheetData {
  // Per-submittal project fields
  projectName: string
  projectAddress?: string | null
  clientName?: string | null
  contractorName?: string | null
  preparedBy?: string | null       // legacy — unused in new layout
  preparedFor?: string | null
  date: string
  revisionNumber: number
  // Company branding (persisted singleton)
  companyName?: string | null
  companyAddress?: string | null
  companyPhone?: string | null
  companyEmail?: string | null
  companyWebsite?: string | null
  logoBase64?: string | null       // full data URI "data:image/png;base64,..."
  logoMimeType?: string | null     // "image/png" | "image/jpeg"
  // Personal prepared-by card
  preparedByName?: string | null
  preparedByTitle?: string | null
  preparedByPhone?: string | null
  preparedByEmail?: string | null
}

// Draw centered text, returns the text width
function drawCentered(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  pageWidth: number,
  marginX = 36,
) {
  const w = font.widthOfTextAtSize(text, size)
  const x = Math.max(marginX, (pageWidth - w) / 2)
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

  // ─────────────────────────────────────────────────────────────────────
  // TOP SECTION — company branding (centered, flows top-down)
  // ─────────────────────────────────────────────────────────────────────

  let y = 752

  // Logo
  const LOGO_MAX_W = 150
  const LOGO_MAX_H = 90

  if (data.logoBase64) {
    try {
      const b64 = data.logoBase64.replace(/^data:[^;]+;base64,/, '')
      const imgBytes = Buffer.from(b64, 'base64')
      const isPng = (data.logoMimeType ?? '').includes('png')
      const img = isPng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)
      const scale = Math.min(LOGO_MAX_W / img.width, LOGO_MAX_H / img.height)
      const imgW = img.width  * scale
      const imgH = img.height * scale
      const imgX = (width - imgW) / 2
      const imgY = y - imgH
      // White backdrop so any non-transparent logo background blends into the page
      page.drawRectangle({ x: imgX, y: imgY, width: imgW, height: imgH, color: rgb(1, 1, 1) })
      page.drawImage(img, { x: imgX, y: imgY, width: imgW, height: imgH })
      y -= imgH + 10
    } catch { /* skip */ }
  }

  // Company name
  if (data.companyName) {
    drawCentered(page, data.companyName, y, bold, 16, DARK, width)
    y -= 22
  }

  // Company contact lines (one per non-empty value)
  for (const line of [data.companyAddress, data.companyPhone, data.companyEmail, data.companyWebsite]) {
    if (!line) continue
    drawCentered(page, line, y, regular, 10, GRAY, width)
    y -= 14
  }

  // ─────────────────────────────────────────────────────────────────────
  // TITLE BAND — centered
  // ─────────────────────────────────────────────────────────────────────

  y -= 28

  drawCentered(page, 'LIGHTING SUBMITTAL', y, bold, 28, BLACK, width)

  // ─────────────────────────────────────────────────────────────────────
  // BOTTOM SECTION — two columns, anchored at fixed Y
  // ─────────────────────────────────────────────────────────────────────

  const BASE_Y    = 310   // both columns start here and flow downward
  const LEFT_X    = 36
  const RIGHT_X   = 330   // right column start
  const LINE_SM   = 13    // spacing for 9-10pt lines
  const LINE_MD   = 18    // spacing for 12-14pt lines

  // ── Left: project details ───────────────────────────────────────────
  const revStr = `Rev ${String(data.revisionNumber).padStart(2, '0')}`
  let ly = BASE_Y

  // Project name — bold 14pt
  page.drawText(data.projectName, { x: LEFT_X, y: ly, font: bold, size: 14, color: DARK })
  ly -= LINE_MD

  // Address — no label
  if (data.projectAddress) {
    page.drawText(data.projectAddress, { x: LEFT_X, y: ly, font: regular, size: 10, color: DARK })
    ly -= LINE_SM
  }

  // Client — labeled
  if (data.clientName) {
    page.drawText(`Client: ${data.clientName}`, { x: LEFT_X, y: ly, font: regular, size: 10, color: DARK })
    ly -= LINE_SM
  }

  // Contractor — labeled
  if (data.contractorName) {
    page.drawText(`Contractor: ${data.contractorName}`, { x: LEFT_X, y: ly, font: regular, size: 10, color: DARK })
    ly -= LINE_SM
  }

  // Date · Rev — gray
  page.drawText(`${data.date}  ·  ${revStr}`, { x: LEFT_X, y: ly, font: regular, size: 10, color: GRAY })

  // ── Right: prepared by card ─────────────────────────────────────────
  const hasPreparedBy = !!(data.preparedByName || data.preparedByTitle || data.preparedByPhone || data.preparedByEmail)

  if (hasPreparedBy) {
    let ry = BASE_Y

    // "PREPARED BY" label — small gray caps
    page.drawText('PREPARED BY', { x: RIGHT_X, y: ry, font: regular, size: 8, color: GRAY })
    ry -= 14

    // Name — bold 12pt
    if (data.preparedByName) {
      page.drawText(data.preparedByName, { x: RIGHT_X, y: ry, font: bold, size: 12, color: DARK })
      ry -= LINE_MD
    }

    // Title, phone, email — regular 9pt gray
    for (const line of [data.preparedByTitle, data.preparedByPhone, data.preparedByEmail]) {
      if (!line) continue
      page.drawText(line, { x: RIGHT_X, y: ry, font: regular, size: 9, color: GRAY })
      ry -= LINE_SM
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // FOOTER
  // ─────────────────────────────────────────────────────────────────────

  const brand  = 'Prepared with Atlantis KB'
  const brandW = regular.widthOfTextAtSize(brand, 7)
  page.drawText(brand, {
    x: (width - brandW) / 2,
    y: 18,
    font: regular,
    size: 7,
    color: FAINT_GRAY,
  })
}
