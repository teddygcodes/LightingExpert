import { PDFDocument, PDFPage, PDFName, PDFArray, StandardFonts, PageSizes } from 'pdf-lib'
import * as fs from 'fs'
import * as path from 'path'
import { buildCoverSheet, CoverSheetData } from './cover-sheet'
import { buildTableOfContents, TocEntry } from './table-of-contents'
import { buildMissingSpecSheetPage } from './placeholder-page'
import { addHeaderFooter, HeaderFooterOptions } from './page-template'
import { saveSubmittal } from '@/lib/storage'
import { annotateSpecSheet } from './annotate-spec-sheet'

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
  catalogOverride?: string | null     // configured catalog string for spec-sheet highlighting
  matrixSeparator?: string | null     // separator used in the ordering matrix (default '-')
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
  catalogString?: string     // catalog number shown in dark spec-sheet header
  isSpecSheetPage?: boolean  // true → Style B dark header + content scaling
}

const SPEC_HEADER_HEIGHT = 45
const SPEC_FOOTER_CLEARANCE = 30

// Scale down existing page content to fit within [footerClearance, height - headerHeight].
// Wraps the existing content streams in a save/restore + matrix transform.
function scalePageContentForHeader(page: PDFPage, headerHeight: number, footerHeight: number): void {
  const { height } = page.getSize()
  const scale = (height - headerHeight - footerHeight) / height
  const yOffset = footerHeight

  const transformPrefix = `q ${scale.toFixed(4)} 0 0 ${scale.toFixed(4)} 0 ${yOffset.toFixed(4)} cm\n`
  const transformSuffix = `\nQ\n`

  const doc = page.doc
  const contentsRef = page.node.get(PDFName.of('Contents'))

  const prefixStream = doc.context.stream(transformPrefix)
  const suffixStream = doc.context.stream(transformSuffix)
  const prefixRef = doc.context.register(prefixStream)
  const suffixRef = doc.context.register(suffixStream)

  if (contentsRef instanceof PDFArray) {
    const arr = PDFArray.withContext(doc.context)
    arr.push(prefixRef)
    for (const ref of contentsRef.asArray()) arr.push(ref)
    arr.push(suffixRef)
    page.node.set(PDFName.of('Contents'), arr)
  } else if (contentsRef) {
    const arr = PDFArray.withContext(doc.context)
    arr.push(prefixRef)
    arr.push(contentsRef)
    arr.push(suffixRef)
    page.node.set(PDFName.of('Contents'), arr)
  }
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
  catalogOverride?: string | null
  matrixSeparator?: string | null
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
        catalogOverride: f.catalogOverride,
        matrixSeparator: f.matrixSeparator,
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
  await buildCoverSheet(pdfDoc, input.coverData, fonts, input.showBranding ?? true)
  pageContexts.push({ isHeaderable: false })

  // Page 1: TOC — blank page, filled in during Pass 2
  const tocPage = pdfDoc.addPage(PageSizes.Letter)
  pageContexts.push({ isHeaderable: true })

  // Group fixtures for divider + spec sheet sections
  const groups = groupFixtures(input.fixtures)

  // Fixture sections: spec sheets (TOC links directly to first spec page per group)
  interface TocSection {
    type: string
    totalQty: number
    manufacturer: string
    catalogNumber: string
    specPageIndex: number
    specPageRef: ReturnType<typeof pdfDoc.getPage>['ref']
  }
  const tocSections: TocSection[] = []

  for (const group of groups) {
    // Record where this group's first page will land
    const specPageIndex = pdfDoc.getPageCount()

    // Spec sheet pages
    const specPageCtx: PageContext = {
      isHeaderable: true,
      fixtureType: group.type,
      fixtureDescription: group.description,
      catalogString: group.catalogOverride ?? group.catalogNumber,
      isSpecSheetPage: true,
    }

    if (!group.specSheetPath) {
      warnings.push(`Missing spec sheet for ${group.catalogNumber}`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, 'Spec sheet not cached', fonts)
      pageContexts.push(specPageCtx)
      tocSections.push({ type: group.type, totalQty: group.totalQty, manufacturer: group.manufacturer, catalogNumber: group.catalogNumber, specPageIndex, specPageRef: pdfDoc.getPage(specPageIndex).ref })
      continue
    }

    const absolutePath = resolveSpecSheetPath(group.specSheetPath)
    if (!absolutePath) {
      warnings.push(`Invalid spec sheet path for ${group.catalogNumber} — path traversal rejected`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, 'Invalid file path', fonts)
      pageContexts.push(specPageCtx)
      tocSections.push({ type: group.type, totalQty: group.totalQty, manufacturer: group.manufacturer, catalogNumber: group.catalogNumber, specPageIndex, specPageRef: pdfDoc.getPage(specPageIndex).ref })
      continue
    }

    if (!fs.existsSync(absolutePath)) {
      warnings.push(`Spec sheet file not found for ${group.catalogNumber}`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, 'File not found on disk', fonts)
      pageContexts.push(specPageCtx)
      tocSections.push({ type: group.type, totalQty: group.totalQty, manufacturer: group.manufacturer, catalogNumber: group.catalogNumber, specPageIndex, specPageRef: pdfDoc.getPage(specPageIndex).ref })
      continue
    }

    let specBytes: Buffer
    try {
      specBytes = fs.readFileSync(absolutePath)
    } catch {
      warnings.push(`Could not read spec sheet for ${group.catalogNumber}`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, 'File read error', fonts)
      pageContexts.push(specPageCtx)
      tocSections.push({ type: group.type, totalQty: group.totalQty, manufacturer: group.manufacturer, catalogNumber: group.catalogNumber, specPageIndex, specPageRef: pdfDoc.getPage(specPageIndex).ref })
      continue
    }

    // Annotate spec sheet with yellow highlights for the selected ordering options
    if (group.catalogOverride) {
      specBytes = await annotateSpecSheet(
        specBytes,
        group.catalogOverride,
        group.matrixSeparator ?? '-',
      )
    }

    try {
      const specDoc = await PDFDocument.load(specBytes, { ignoreEncryption: true })
      const specPageCount = specDoc.getPageCount()
      if (specPageCount === 0) throw new Error('Zero-page PDF')
      const indices = Array.from({ length: specPageCount }, (_, i) => i)
      const copiedPages = await pdfDoc.copyPages(specDoc, indices)
      for (const p of copiedPages) {
        pdfDoc.addPage(p)
        pageContexts.push({
          isHeaderable: true,
          fixtureType: group.type,
          fixtureDescription: group.description,
          catalogString: group.catalogOverride ?? group.catalogNumber,
          isSpecSheetPage: true,
        })
      }
      tocSections.push({ type: group.type, totalQty: group.totalQty, manufacturer: group.manufacturer, catalogNumber: group.catalogNumber, specPageIndex, specPageRef: pdfDoc.getPage(specPageIndex).ref })
    } catch (err) {
      const reason = err instanceof Error && err.message === 'Zero-page PDF'
        ? 'PDF contains no pages'
        : 'PDF could not be embedded (encrypted or corrupt)'
      warnings.push(`Could not embed spec sheet for ${group.catalogNumber}: ${reason}`)
      buildMissingSpecSheetPage(pdfDoc, group.catalogNumber, reason, fonts)
      pageContexts.push(specPageCtx)
      tocSections.push({ type: group.type, totalQty: group.totalQty, manufacturer: group.manufacturer, catalogNumber: group.catalogNumber, specPageIndex, specPageRef: pdfDoc.getPage(specPageIndex).ref })
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
    const page = pdfDoc.getPage(i)

    if (ctx.isSpecSheetPage) {
      scalePageContentForHeader(page, SPEC_HEADER_HEIGHT, SPEC_FOOTER_CLEARANCE)
    }

    const headerOpts: HeaderFooterOptions = {
      projectName,
      revisionNumber,
      date,
      displayPageNumber,
      displayTotalPages,
      fixtureType: ctx.fixtureType,
      fixtureDescription: ctx.fixtureDescription,
      catalogString: ctx.catalogString,
      isSpecSheetPage: ctx.isSpecSheetPage,
    }
    addHeaderFooter(page, fonts, headerOpts)
  }

  // Fill TOC (page index 1) — links point directly to first spec sheet page per group
  const tocEntries: TocEntry[] = tocSections.map(s => ({
    type: s.type,
    qty: s.totalQty,
    manufacturer: s.manufacturer,
    catalogNumber: s.catalogNumber,
    displayPageNumber: s.specPageIndex + 1,  // 1-based
    pageRef: s.specPageRef,
  }))

  buildTableOfContents(pdfDoc, tocPage, tocEntries, fonts)

  // ──────────────────────────────────────────────────────────────────
  // Save
  // ──────────────────────────────────────────────────────────────────

  const pdfBytes = await pdfDoc.save()
  const pdfUrl = await saveSubmittal(input.submittalId, Buffer.from(pdfBytes))

  return { pdfUrl, warnings }
}
