import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import * as fs from 'fs'
import * as path from 'path'
import { buildCoverSheet, CoverSheetData } from './cover-sheet'
import { buildFixtureSchedule, ScheduleRow } from './fixture-schedule'
import { saveSubmittal } from '@/lib/storage'

export interface FixtureEntry {
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
  specSheetPath?: string | null
}

export interface GeneratorInput {
  submittalId: string
  coverData: CoverSheetData
  fixtures: FixtureEntry[]
}

export interface GeneratorResult {
  pdfUrl: string
  warnings: string[]
}

async function buildDividerPage(doc: PDFDocument, label: string): Promise<void> {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([612, 792])
  const { width, height } = page.getSize()

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.96, 0.96, 0.96) })
  page.drawRectangle({ x: 40, y: height / 2 - 28, width: width - 80, height: 56, color: rgb(0.82, 0.20, 0.22) })

  const textWidth = bold.widthOfTextAtSize(label, 22)
  page.drawText(label, {
    x: (width - textWidth) / 2,
    y: height / 2 - 8,
    font: bold,
    size: 22,
    color: rgb(1, 1, 1),
  })

  page.drawText('FIXTURE TYPE SPECIFICATION', {
    x: 60,
    y: height / 2 - 50,
    font: bold,
    size: 9,
    color: rgb(0.5, 0.5, 0.5),
  })
}

async function buildMissingPlaceholder(doc: PDFDocument, catalogNumber: string, reason: string): Promise<void> {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([612, 792])
  const { width, height } = page.getSize()

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) })
  page.drawRectangle({ x: 40, y: height - 100, width: width - 80, height: 60, color: rgb(0.96, 0.96, 0.96) })
  page.drawText('SPEC SHEET UNAVAILABLE', {
    x: 55,
    y: height - 58,
    font: bold,
    size: 13,
    color: rgb(0.82, 0.20, 0.22),
  })
  page.drawText(catalogNumber, {
    x: 55,
    y: height - 76,
    font: bold,
    size: 10,
    color: rgb(0.1, 0.1, 0.1),
  })

  page.drawText(`Reason: ${reason}`, {
    x: 55,
    y: height - 140,
    font: regular,
    size: 10,
    color: rgb(0.4, 0.4, 0.4),
  })
  page.drawText('Please attach the manufacturer spec sheet manually.', {
    x: 55,
    y: height - 160,
    font: regular,
    size: 10,
    color: rgb(0.4, 0.4, 0.4),
  })

  page.drawLine({
    start: { x: 40, y: 40 },
    end: { x: width - 40, y: 40 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  })
  page.drawText('Atlantis KB — Lighting Expert', {
    x: 40,
    y: 24,
    font: regular,
    size: 8,
    color: rgb(0.6, 0.6, 0.6),
  })
}

export async function generateSubmittalPDF(input: GeneratorInput): Promise<GeneratorResult> {
  const warnings: string[] = []
  const doc = await PDFDocument.create()

  // ── Page 1: Cover sheet ──────────────────────────────────────────
  const missingCats = input.fixtures.filter(f => !f.specSheetPath).map(f => f.catalogNumber)
  await buildCoverSheet(doc, { ...input.coverData, missingDocuments: missingCats })

  // ── Pages 2+: Fixture schedule ────────────────────────────────────
  const scheduleRows: ScheduleRow[] = input.fixtures.map(f => ({
    type: f.type,
    qty: f.qty,
    manufacturer: f.manufacturer,
    catalogNumber: f.catalogNumber,
    description: f.description,
    watts: f.watts,
    lumens: f.lumens,
    cct: f.cct,
    cri: f.cri,
    voltage: f.voltage,
    ipNema: f.ipNema,
    mounting: f.mounting,
    location: f.location,
    notes: f.notes,
  }))
  await buildFixtureSchedule(doc, scheduleRows)

  // ── Per-fixture: divider + spec sheet ────────────────────────────
  for (const fixture of input.fixtures) {
    // Divider page
    await buildDividerPage(doc, `TYPE ${fixture.type} — ${fixture.catalogNumber}`)

    // Spec sheet PDF
    if (!fixture.specSheetPath) {
      warnings.push(`Missing spec sheet for ${fixture.catalogNumber}`)
      await buildMissingPlaceholder(doc, fixture.catalogNumber, 'Spec sheet not cached')
      continue
    }

    const publicDir = path.join(process.cwd(), 'public')
    const resolvedPath = path.resolve(publicDir, fixture.specSheetPath.replace(/^\//, ''))
    if (!resolvedPath.startsWith(publicDir + path.sep)) {
      warnings.push(`Invalid spec sheet path for ${fixture.catalogNumber} — path traversal rejected`)
      await buildMissingPlaceholder(doc, fixture.catalogNumber, 'Invalid file path')
      continue
    }
    const absolutePath = resolvedPath

    if (!fs.existsSync(absolutePath)) {
      warnings.push(`Spec sheet file not found for ${fixture.catalogNumber}: ${absolutePath}`)
      await buildMissingPlaceholder(doc, fixture.catalogNumber, 'File not found on disk')
      continue
    }

    let specBytes: Buffer
    try {
      specBytes = fs.readFileSync(absolutePath)
    } catch {
      warnings.push(`Could not read spec sheet for ${fixture.catalogNumber}`)
      await buildMissingPlaceholder(doc, fixture.catalogNumber, 'File read error')
      continue
    }

    try {
      const specDoc = await PDFDocument.load(specBytes, { ignoreEncryption: true })
      const pageCount = specDoc.getPageCount()
      const pageIndices = Array.from({ length: pageCount }, (_, i) => i)
      const copiedPages = await doc.copyPages(specDoc, pageIndices)
      for (const p of copiedPages) doc.addPage(p)
    } catch {
      warnings.push(`Could not embed spec sheet for ${fixture.catalogNumber} (may be encrypted or corrupt)`)
      await buildMissingPlaceholder(doc, fixture.catalogNumber, 'PDF could not be embedded (encrypted or corrupt)')
    }
  }

  // ── Save ──────────────────────────────────────────────────────────
  const pdfBytes = await doc.save()
  const buffer = Buffer.from(pdfBytes)
  const pdfUrl = await saveSubmittal(input.submittalId, buffer)

  return { pdfUrl, warnings }
}
