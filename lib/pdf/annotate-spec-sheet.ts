// lib/pdf/annotate-spec-sheet.ts
//
// Annotates a spec sheet PDF with yellow highlights on the cells matching
// the selected ordering option codes from a configured catalog number.
// Used during submittal PDF generation to visually mark what was ordered.

import { PDFDocument, rgb } from 'pdf-lib'

// Lazy-import pdfjs at call time to avoid Next.js bundling issues.
// Must use the legacy build in Node.js environments (no browser Worker API).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPdfjs(): Promise<any> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Setting workerSrc to a non-empty string activates the fake-worker path
  // in the legacy build, which runs inline on the main thread (no subprocess).
  pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
  return pdfjs
}

interface HighlightRect {
  page: number   // 1-based
  x: number      // PDF points from left
  y: number      // PDF points from bottom
  w: number      // width in points
  h: number      // height in points
}

interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
  page: number
}

// Common heading phrases that introduce the ordering matrix table
const ORDER_SECTION_RE = /ordering\s+information|ordering\s+guide|order\s+guide|how\s+to\s+order/i

// Section headings that signal the END of the ordering matrix region
const SECTION_HEADING_RE = /^(?:SPECIFICATIONS?|DIMENSIONS?|FEATURES?|NOTES?|ACCESSORIES|WARRANTY|LISTINGS?|CERTIFICATIONS?|PHOTOMETRIC|ELECTRICAL|MECHANICAL|OPTIONS|FINISH(?:ES)?|PERFORMANCE|INSTALLATION|LUMEN\s+MAINTENANCE|CONSTRUCTION|DRIVER|HOUSING|LENS|OPTICS|WIRING|MOUNTING|CONTROLS?|DIMMING|EMERGENCY|DERA(?:TED)?|PRODUCT\s+INFORMATION|TECHNICAL\s+DATA)\s*$/i

interface SectionBound {
  page: number
  yTop: number     // upper boundary (PDF y, larger = higher on page)
  yBottom: number   // lower boundary (PDF y, smaller = lower on page)
}

/**
 * Annotates a spec sheet PDF with yellow highlights on cells matching
 * the individual option codes extracted from `catalogOverride`.
 *
 * Matching is restricted to the ordering information table section
 * (identified by common header phrases) to avoid false positives in
 * descriptive paragraph text.
 *
 * @param specBuffer    Raw bytes of the spec sheet PDF
 * @param catalogOverride  The configured catalog string (e.g. "SPX 2X4 3000LM 80CRI 40K MW")
 * @param separator     The separator between option codes (e.g. " " or "-")
 * @returns             Annotated PDF bytes (or original if no matches / extraction fails)
 */
export async function annotateSpecSheet(
  specBuffer: Buffer,
  catalogOverride: string,
  separator: string,
): Promise<Buffer> {
  try {
    // 1. Parse option codes — strip surrounding whitespace, skip empty tokens
    const sep = separator === ' ' ? /\s+/ : separator
    const codes = catalogOverride
      .split(sep)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.toUpperCase())
    const codeSet = new Set(codes)

    if (codeSet.size === 0) return specBuffer

    // 2. Extract all text items with PDF-space coordinates via pdfjs-dist (Node build)
    const pdfjs = await getPdfjs()
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(specBuffer),
      // Suppress font / worker warnings in Node
      verbosity: 0,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    const pdfjsDoc = await loadingTask.promise

    const allItems: TextItem[] = []

    for (let pageNum = 1; pageNum <= pdfjsDoc.numPages; pageNum++) {
      const page = await pdfjsDoc.getPage(pageNum)
      const content = await page.getTextContent()
      const raw = content.items as Array<{ str: string; transform: number[]; width: number; height: number }>
      for (const item of raw) {
        allItems.push({ ...item, page: pageNum })
      }
    }

    // 3. Find ordering section headers and compute bounded regions.
    //    PDF y increases upward, so items below the header have smaller y values.
    const orderingHeaders: { page: number; y: number }[] = []
    for (const item of allItems) {
      if (ORDER_SECTION_RE.test(item.str)) {
        orderingHeaders.push({ page: item.page, y: item.transform[5] })
      }
    }

    // 4. Compute tight section bounds — find where the ordering section ENDS
    //    by looking for the next major section heading below the ordering header.
    //    Column headers within the ordering table (e.g. DIMMING, VOLTAGE) must NOT
    //    be mistaken for section headings. We distinguish them by checking whether
    //    multiple items share the same y-coordinate (table row) vs a standalone heading.
    const sectionBounds: SectionBound[] = []

    // Pre-compute: how many text items share each (page, y) coordinate
    const yBuckets = new Map<string, number>()
    for (const item of allItems) {
      const key = `${item.page}:${Math.round(item.transform[5])}`
      yBuckets.set(key, (yBuckets.get(key) ?? 0) + 1)
    }
    const isStandaloneHeading = (item: TextItem): boolean => {
      const key = `${item.page}:${Math.round(item.transform[5])}`
      // A standalone section heading typically has few items on its line (≤3)
      // Table column headers appear with many siblings on the same y row
      return (yBuckets.get(key) ?? 0) <= 3
    }

    for (const header of orderingHeaders) {
      // Find the next section heading below the ordering header on the same page
      const nextHeadingSamePage = allItems.find(item =>
        item.page === header.page &&
        item.transform[5] < header.y - 20 &&  // must be well below the ordering header
        SECTION_HEADING_RE.test(item.str.trim()) &&
        isStandaloneHeading(item)              // skip table column headers
      )

      sectionBounds.push({
        page: header.page,
        yTop: header.y,
        yBottom: nextHeadingSamePage ? nextHeadingSamePage.transform[5] + 10 : 0,
      })

      // For next-page spillover: only include content above the first section heading
      // on the next page (tables sometimes span a page break).
      if (!nextHeadingSamePage) {
        const nextPageHeading = allItems.find(item =>
          item.page === header.page + 1 &&
          SECTION_HEADING_RE.test(item.str.trim()) &&
          isStandaloneHeading(item)
        )

        // Get page height from the highest text item on the next page
        const nextPageItems = allItems.filter(i => i.page === header.page + 1)
        const nextPageTop = nextPageItems.length > 0
          ? Math.max(...nextPageItems.map(i => i.transform[5])) + 20
          : 792  // default letter height

        sectionBounds.push({
          page: header.page + 1,
          yTop: nextPageTop,
          yBottom: nextPageHeading ? nextPageHeading.transform[5] + 10 : nextPageTop * 0.6,
        })
      }
    }

    // 5. Match codes — restricted to the bounded ordering table region.
    //    If no headers are found, fall back to matching anywhere (original behavior).
    const hasBounds = sectionBounds.length > 0

    const isInOrderingSection = (item: TextItem): boolean => {
      if (!hasBounds) return true
      const y = item.transform[5]
      return sectionBounds.some(b =>
        item.page === b.page && y <= b.yTop && y >= b.yBottom
      )
    }

    const matches: HighlightRect[] = []

    for (const item of allItems) {
      const raw = item.str.trim()
      if (!raw) continue

      const upper = raw.toUpperCase()
      if (!codeSet.has(upper)) continue

      if (!isInOrderingSection(item)) continue

      // transform = [a, b, c, d, tx, ty]  — PDF user space (points, bottom-left origin)
      const tx = item.transform[4]
      const ty = item.transform[5]
      const w = item.width || 20
      // height: use item.height if available; fall back to abs(d) component
      const h = item.height > 0 ? item.height : Math.abs(item.transform[3])
      // Add a small padding around the text
      const PAD = 2
      matches.push({ page: item.page, x: tx - PAD, y: ty - PAD, w: w + PAD * 2, h: h + PAD * 2 })
    }

    if (matches.length === 0) return specBuffer

    // 5. Draw yellow highlights with pdf-lib
    const libDoc = await PDFDocument.load(specBuffer, { ignoreEncryption: true })
    const yellow = rgb(1, 0.94, 0.1)

    for (const m of matches) {
      const page = libDoc.getPage(m.page - 1)
      page.drawRectangle({
        x: m.x,
        y: m.y,
        width: m.w,
        height: m.h,
        color: yellow,
        opacity: 0.45,
      })
    }

    return Buffer.from(await libDoc.save())
  } catch (err) {
    // Non-fatal: if annotation fails for any reason, return the original spec sheet
    console.warn('[annotate-spec-sheet] Annotation failed (non-fatal):', err instanceof Error ? err.message : err)
    return specBuffer
  }
}
