import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'

const anthropic = new Anthropic()

const EXTRACT_PROMPT = `You are reading a lighting fixture schedule from a construction document.
Extract every fixture entry and return a JSON array with this exact shape:
[{"type":"A","catalog":"2GTL-4-40L-EZI","qty":1}]

Rules:
- "type" = the fixture callout/type label (A, A1, D, J1-EM, P2, S4, T, WP1, XC, etc.)
- "catalog" = the model/catalog code ONLY — strip any leading manufacturer name
  The MODEL column often reads "MANUFACTURER MODEL" — return only the model part:
  "LITHONIA 2GTL-4-40L-EZI"          → "2GTL-4-40L-EZI"
  "LITHONIA LDNG-35/10-L06-MVOLT-EZ10" → "LDNG-35/10-L06-MVOLT-EZ10"
  "ACUITY BRANDS, WDGE2"              → "WDGE2"
  "ACUITY BRANDS, R5X2"               → "R5X2"
  "LITHONIA LHQM-LED-R-HO"           → "LHQM-LED-R-HO"
  "LITHONIA ELM2L-LED"                → "ELM2L-LED"
  If the model is a long space-separated string like "CPHB 30000LM SEF GCL MD MVOLT GZ10 40K 80CRI ...",
  return that full string without the leading manufacturer name.
- "qty" = integer quantity from the LAMP column (e.g. "(1)" → 1, "(2)" → 2); default 1
- Skip rows where MODEL is "TBD", blank, or clearly not a product
- Skip footer notes, header rows, total rows
- Return ONLY a valid JSON array, no markdown fences, no explanation`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const submittal = await prisma.submittal.findUnique({ where: { id }, select: { id: true } })
  if (!submittal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileBlock: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.type || 'image/png', data: base64 } }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: EXTRACT_PROMPT }] }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

  let extracted: { type: string; catalog: string; qty?: number }[] = []
  try {
    // Strip markdown fences if Claude adds them despite instructions
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    extracted = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'Could not parse fixture schedule from document', raw }, { status: 422 })
  }

  if (!Array.isArray(extracted) || extracted.length === 0) {
    return NextResponse.json({ imported: [], unmatched: [] })
  }

  const maxOrder = await prisma.submittalItem.findFirst({
    where: { submittalId: id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  let nextSort = (maxOrder?.sortOrder ?? -1) + 1

  const imported: string[] = []
  const unmatched: string[] = []

  for (const entry of extracted) {
    const catalog = (entry.catalog ?? '').trim()
    const fixtureType = (entry.type ?? '').trim().toUpperCase()
    const qty = Math.max(1, parseInt(String(entry.qty ?? 1), 10) || 1)
    if (!catalog || !fixtureType) continue

    // 1. Exact catalog number match
    let product = await prisma.product.findFirst({
      where: { catalogNumber: { equals: catalog, mode: 'insensitive' }, isActive: true },
      select: { id: true, catalogNumber: true },
    })

    // 2. Base-prefix match (first hyphen-delimited segment, e.g. "LHQM" from "LHQM-LED-R-HO")
    if (!product) {
      const prefix = catalog.split('-')[0].trim()
      if (prefix && prefix.length >= 2) {
        product = await prisma.product.findFirst({
          where: { catalogNumber: { startsWith: prefix, mode: 'insensitive' }, isActive: true },
          orderBy: { overallConfidence: 'desc' },
          select: { id: true, catalogNumber: true },
        })
      }
    }

    // 3. Manufacturer-prefix fallback — progressively strip leading words
    //    Handles cases where a mfr name slipped through (e.g. "LITHONIA LHQM-LED-R-HO")
    if (!product && catalog.includes(' ')) {
      const words = catalog.split(/\s+/)
      for (let i = 1; i < words.length; i++) {
        const rest = words.slice(i).join(' ').replace(/^,\s*/, '').trim()
        const prefix = rest.split('-')[0].trim()
        if (!prefix || prefix.length < 2) continue
        product = await prisma.product.findFirst({
          where: { catalogNumber: { startsWith: prefix, mode: 'insensitive' }, isActive: true },
          orderBy: { overallConfidence: 'desc' },
          select: { id: true, catalogNumber: true },
        })
        if (product) break
      }
    }

    // 4. familyName / displayName prefix match — for numeric-catalogNumber products (Acuity/Lithonia)
    //    e.g. "LHQM-LED-R-HO" → prefix "LHQM" → familyName startsWith "LHQM"
    if (!product) {
      const prefix = catalog.split(/[-\s]/)[0].trim()
      if (prefix.length >= 2) {
        product = await prisma.product.findFirst({
          where: {
            isActive: true,
            OR: [
              { familyName: { startsWith: prefix, mode: 'insensitive' } },
              { displayName: { startsWith: prefix, mode: 'insensitive' } },
            ],
          },
          orderBy: { overallConfidence: 'desc' },
          select: { id: true, catalogNumber: true },
        })
      }
    }

    if (!product) {
      unmatched.push(catalog)
      continue
    }

    await prisma.submittalItem.create({
      data: {
        submittalId: id,
        productId: product.id,
        fixtureType,
        quantity: qty,
        catalogNumberOverride: catalog.toLowerCase() !== product.catalogNumber.toLowerCase() ? catalog : null,
        sortOrder: nextSort++,
      },
    })
    imported.push(`${fixtureType}: ${catalog}`)
  }

  return NextResponse.json({ imported, unmatched })
}
