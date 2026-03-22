import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib'
import * as fs from 'fs'
import * as path from 'path'
import { buildCoverSheet, CoverSheetData } from './cover-sheet'
import { buildFixtureSchedule, ScheduleRow } from './fixture-schedule'
import { buildTableOfContents, TocEntry } from './table-of-contents'
import { buildFixtureDividerPage } from './divider-page'
import { buildMissingSpecSheetPage } from './placeholder-page'
import { addHeaderFooter, HeaderFooterOptions } from './page-template'
import { saveSubmittal } from '@/lib/storage'

// ── Natural sort for fixture types (A, A1, A2, AA, B, EM-A, etc.) ──
function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g
  const ax = [...a.matchAll(re)]
  const bx = [...b.matchAll(re)]
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const an = ax[i]?.[0] ?? ''
    const bn = bx[i]?.[0] ?? ''
    const aNum = parseInt(an, 10)
    const bNum = parseInt(bn, 10)
    if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum
    if (an !== bn) return an < bn ? -1 : 1
  }
  return 0
}

// ── Interfaces ─────────────────────────────────────────────────────

export interface FixtureEntry {
  type: string
  qty: number
  manufacturer: string
  catalogNumber: string
  description: string
  watts: string
  lumens: string
  cct: string
  voltage: string
  location: string
  notes: string
  specSheetPath?: string | null
}

export interface GeneratorInput {
  submittalId: string
  coverData: CoverSheetData
  fixtures: FixtureEntry[]
  showBranding?: boolean
}

export interface GeneratorResult {
  pdfUrl: string
  warnings: string[]
}

// Tracks per-page context for the header/footer pass
interface PageContext {
  isHeaderable: boolean
  fixtureType?: string
  fixtureDescription?: string
}

// Internal grouping for fixture sections
interface FixtureGroup {
  type: string
  totalQty: number
  manufacturer: string
  catalogNumber: string
  description: string
  locations: string[]
  specSheetPath?: string | null
}

function groupFixtures(fixtures: FixtureEntry[]): FixtureGroup[] {
  const map = new Map<string, FixtureGroup>()
  for (const f of fixtures) {
    const existing = map.get(f.type)
    if (existing) {
      existing.totalQty += f.qty
      if (f.location) existing.locations.push(f.location)
    } else {
      map.set(f.type, {
        type: f.type,
        totalQty: f.qty,
        manufacturer: f.manufacturer,
        catalogNumber: f.catalogNumber,
        description: f.description,
        locations: f.location ? [f.location] : [],
        specSheetPath: f.specSheetPath,
      })
    }
  }
  return [...map.values()].sort((a, b) => naturalCompare(a.type, b.type))
}

function resolveSpecSheetPath(specSheetPath: string): string | null {
  const publicDir = path.join(process.cwd(), 'public')
  const resolved = path.resolve(publicDir, specSheetPath.replace(/^\//, ''))
  if (!resolved.startsWith(publicDir + path.sep)) return null
  return resolved
}

// ── Main generator ─────────────────────────────────────────────────

export async function generateSubmittalPDF(input: GeneratorInput): Promise<GeneratorResult> {
  const warnings: string[] = []
  const pdfDoc = await PDFDocument.create()

  // Embed fonts once; all helpers receive the same font objects
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular, bold }

  const pageContexts: PageContext[] = []

  // ──────────────────────────────────────────────────────────────────
  // PASS 1 — Assemble all pages
  // ──────────────────────────────────────────────────────────────────

  // Page 0: Cover (not headered)
  buildCoverSheet(pdfDoc, input.coverData, fonts, input.showBranding ?? true)
  pageContexts.push({ isHeaderable: false })

  // Page 1: TOC — blank page, filled in during Pass 2
  const tocPage = pdfDoc.addPage(PageSizes.Letter)
  pageContexts.push({ isHeaderable: true })

  // Pages 2+: Fixture schedule
  const groups = groupFixtures(input.fixtures)

  const scheduleRows: ScheduleRow[] = groups.map(g => ({
    type: g.type,
    qty: g.totalQty,
    manufacturer: g.manufacturer,
    catalogNumber: g.catalogNumber,
    watts: input.fixtures.find(f => f.type === g.type)?.watts ?? '',
    lumens: input.fixtures.find(f => f.type === g.type)?.lumens ?? '',
    cct: input.fixtures.find(f => f.type === g.type)?.cct ?? '',
    voltage: input.fixtures.find(f => f.type === g.type)?.voltage ?? '',
    location: g.locations.join(', '),
  }))

  const schedulePages = buildFixtureSchedule(pdfDoc, scheduleRows, fonts)
  for (const _ of schedulePages) {
    pageContexts.push({ isHeaderable: true })
  }

  // Fixture sections: divider + spec sheets
  interface TocSection {
    type: string
    totalQty: number
    manufacturer: string
    catalogNumber: string
    dividerPageIndex: number
    dividerPageRef: ReturnType<typeof pdfDoc.getPage>['ref']
  }
  const tocSections: TocSection[] = []

  for (const group of groups) {
    // Divider page
    const dividerPage = buildFixtureDividerPage(pdfDoc, {
      type: group.type,
      manufacturer: group.manufacturer,
      catalogNumber: group.catalogNumber,
      qty: group.totalQty,
      location: group.locations.join(', '),
    }, fonts)

    const dividerPageIndex = pdfDoc.getPageCount() - 1
    pageContexts.push({
      isHeaderable: true,
      fixtureType: group.type,
      fixtureDescription: group.description,
    })

    tocSections.push({
      type: group.type,
      totalQty: group.totalQty,
      manufacturer: group.manufacturer,
      catalogNumber: group.catalogNumber,
      dividerPageIndex,
      dividerPageRef: dividerPage.ref,
    })

    // Spec sheet pages
    if (!group.specSheetPath) {
      warnings.push(`Missing spec sheet for ${group.catalogNumber}`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, 'Spec sheet not cached', fonts)
      pageContexts.push({ isHeaderable: true, fixtureType: group.type, fixtureDescription: group.description })
      continue
    }

    const absolutePath = resolveSpecSheetPath(group.specSheetPath)
    if (!absolutePath) {
      warnings.push(`Invalid spec sheet path for ${group.catalogNumber} — path traversal rejected`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, 'Invalid file path', fonts)
      pageContexts.push({ isHeaderable: true, fixtureType: group.type, fixtureDescription: group.description })
      continue
    }

    if (!fs.existsSync(absolutePath)) {
      warnings.push(`Spec sheet file not found for ${group.catalogNumber}`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, 'File not found on disk', fonts)
      pageContexts.push({ isHeaderable: true, fixtureType: group.type, fixtureDescription: group.description })
      continue
    }

    let specBytes: Buffer
    try {
      specBytes = fs.readFileSync(absolutePath)
    } catch {
      warnings.push(`Could not read spec sheet for ${group.catalogNumber}`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, 'File read error', fonts)
      pageContexts.push({ isHeaderable: true, fixtureType: group.type, fixtureDescription: group.description })
      continue
    }

    try {
      const specDoc = await PDFDocument.load(specBytes, { ignoreEncryption: true })
      const specPageCount = specDoc.getPageCount()
      if (specPageCount === 0) throw new Error('Zero-page PDF')
      const indices = Array.from({ length: specPageCount }, (_, i) => i)
      const copiedPages = await pdfDoc.copyPages(specDoc, indices)
      for (const p of copiedPages) {
        pdfDoc.addPage(p)
        pageContexts.push({ isHeaderable: true, fixtureType: group.type, fixtureDescription: group.description })
      }
    } catch (err) {
      const reason = err instanceof Error && err.message === 'Zero-page PDF'
        ? 'PDF contains no pages'
        : 'PDF could not be embedded (encrypted or corrupt)'
      warnings.push(`Could not embed spec sheet for ${group.catalogNumber}: ${reason}`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, reason, fonts)
      pageContexts.push({ isHeaderable: true, fixtureType: group.type, fixtureDescription: group.description })
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // PASS 2 — Stamp headers/footers on all headerable pages, fill TOC
  // ──────────────────────────────────────────────────────────────────

  const displayTotalPages = pdfDoc.getPageCount()
  // Cover is display page 1; every subsequent page increments by 1
  // So page at index i has displayPageNumber = i + 1

  const date = input.coverData.date
  const { revisionNumber, projectName } = input.coverData

  for (let i = 1; i < displayTotalPages; i++) {  // skip index 0 (cover)
    const ctx = pageContexts[i]
    if (!ctx?.isHeaderable) continue

    const displayPageNumber = i + 1
    const headerOpts: HeaderFooterOptions = {
      projectName,
      revisionNumber,
      date,
      displayPageNumber,
      displayTotalPages,
      fixtureType: ctx.fixtureType,
      fixtureDescription: ctx.fixtureDescription,
    }
    addHeaderFooter(pdfDoc.getPage(i), fonts, headerOpts)
  }

  // Fill TOC (page index 1)
  const tocEntries: TocEntry[] = tocSections.map(s => ({
    type: s.type,
    qty: s.totalQty,
    manufacturer: s.manufacturer,
    catalogNumber: s.catalogNumber,
    displayPageNumber: s.dividerPageIndex + 1,  // 1-based
    pageRef: s.dividerPageRef,
  }))

  buildTableOfContents(pdfDoc, tocPage, tocEntries, fonts)

  // ──────────────────────────────────────────────────────────────────
  // Save
  // ──────────────────────────────────────────────────────────────────

  const pdfBytes = await pdfDoc.save()
  const pdfUrl = await saveSubmittal(input.submittalId, Buffer.from(pdfBytes))

  return { pdfUrl, warnings }
}
