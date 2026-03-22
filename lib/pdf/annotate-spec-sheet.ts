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

    // 3. Find ordering section headers: record (page, y) for each header found.
    //    PDF y increases upward, so items below the header have smaller y values.
    const orderingHeaders: { page: number; y: number }[] = []
    for (const item of allItems) {
      if (ORDER_SECTION_RE.test(item.str)) {
        orderingHeaders.push({ page: item.page, y: item.transform[5] })
      }
    }

    // 4. Match codes — restricted to the ordering table region when headers are found.
    //    If no headers are found, fall back to matching anywhere (original behavior).
    const hasHeaders = orderingHeaders.length > 0

    function isInOrderingSection(item: TextItem): boolean {
      if (!hasHeaders) return true
      return orderingHeaders.some(h => {
        if (item.page === h.page) {
          // Below the header on the same page (smaller y in PDF space)
          return item.transform[5] <= h.y
        }
        // Also allow the page immediately after — some tables span a page break
        if (item.page === h.page + 1) return true
        return false
      })
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
