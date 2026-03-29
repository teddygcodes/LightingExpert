import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

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
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await params

  const submittal = await prisma.submittal.findUnique({ where: { id }, select: { id: true } })
  if (!submittal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileBlock: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.type || 'image/png', data: base64 } }

  let response
  try {
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: EXTRACT_PROMPT }] }],
    })
  } catch (err) {
    console.error('[import-schedule] Anthropic API error:', err)
    return NextResponse.json({ error: 'Failed to process document. Please try again.' }, { status: 502 })
  }

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

  let extracted: { type: string; catalog: string; qty?: number }[] = []
  try {
    // Strip markdown fences if Claude adds them despite instructions
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    if (!cleaned) throw new Error('empty response')
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) throw new Error('not an array')
    extracted = parsed
  } catch {
    return NextResponse.json({ error: 'Could not parse fixture schedule from document' }, { status: 422 })
  }

  if (extracted.length === 0) {
    return NextResponse.json({ imported: [], unmatched: [] })
  }

  const maxOrder = await prisma.submittalItem.findFirst({
    where: { submittalId: id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  const nextSort = (maxOrder?.sortOrder ?? -1) + 1

  // Parse entries upfront
  const entries = extracted
    .map(e => ({
      catalog: (e.catalog ?? '').trim(),
      fixtureType: (e.type ?? '').trim().toUpperCase(),
      qty: Math.max(1, parseInt(String(e.qty ?? 1), 10) || 1),
    }))
    .filter(e => e.catalog && e.fixtureType)

  // Batch-fetch all candidate products in a single query
  const prefixes = [...new Set(
    entries.flatMap(e => {
      const parts: string[] = [e.catalog.split(/[-\s]/)[0].trim()]
      // Also extract prefixes from manufacturer-stripped variants
      if (e.catalog.includes(' ')) {
        const words = e.catalog.split(/\s+/)
        for (let i = 1; i < words.length; i++) {
          const rest = words.slice(i).join(' ').replace(/^,\s*/, '').trim()
          const p = rest.split('-')[0].trim()
          if (p.length >= 2) parts.push(p)
        }
      }
      return parts.filter(p => p.length >= 2)
    }).map(p => p.toUpperCase())
  )]

  const candidates = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { catalogNumber: { in: entries.map(e => e.catalog), mode: 'insensitive' } },
        ...prefixes.map(p => ({ catalogNumber: { startsWith: p, mode: 'insensitive' as const } })),
        ...prefixes.map(p => ({ familyName: { startsWith: p, mode: 'insensitive' as const } })),
        ...prefixes.map(p => ({ displayName: { startsWith: p, mode: 'insensitive' as const } })),
      ],
    },
    select: { id: true, catalogNumber: true, familyName: true, displayName: true, overallConfidence: true },
    orderBy: { overallConfidence: 'desc' },
  })

  // Match each entry against candidates in memory (same 4-tier logic)
  const imported: string[] = []
  const unmatched: string[] = []
  const itemsToCreate: {
    submittalId: string; productId: string; fixtureType: string;
    quantity: number; catalogNumberOverride: string | null; sortOrder: number;
  }[] = []

  for (const entry of entries) {
    const catalog = entry.catalog
    let match: typeof candidates[number] | undefined

    // 1. Exact catalog number match
    match = candidates.find(c => c.catalogNumber.toLowerCase() === catalog.toLowerCase())

    // 2. Base-prefix match
    if (!match) {
      const prefix = catalog.split('-')[0].trim().toLowerCase()
      if (prefix.length >= 2) {
        match = candidates.find(c => c.catalogNumber.toLowerCase().startsWith(prefix))
      }
    }

    // 3. Manufacturer-prefix fallback — strip leading words
    if (!match && catalog.includes(' ')) {
      const words = catalog.split(/\s+/)
      for (let i = 1; i < words.length && !match; i++) {
        const rest = words.slice(i).join(' ').replace(/^,\s*/, '').trim()
        const prefix = rest.split('-')[0].trim().toLowerCase()
        if (prefix.length >= 2) {
          match = candidates.find(c => c.catalogNumber.toLowerCase().startsWith(prefix))
        }
      }
    }

    // 4. familyName / displayName prefix match
    if (!match) {
      const prefix = catalog.split(/[-\s]/)[0].trim().toLowerCase()
      if (prefix.length >= 2) {
        match = candidates.find(c =>
          (c.familyName?.toLowerCase().startsWith(prefix)) ||
          (c.displayName?.toLowerCase().startsWith(prefix))
        )
      }
    }

    if (!match) {
      unmatched.push(catalog)
      continue
    }

    itemsToCreate.push({
      submittalId: id,
      productId: match.id,
      fixtureType: entry.fixtureType,
      quantity: entry.qty,
      catalogNumberOverride: catalog.toLowerCase() !== match.catalogNumber.toLowerCase() ? catalog : null,
      sortOrder: nextSort + itemsToCreate.length,
    })
    imported.push(`${entry.fixtureType}: ${catalog}`)
  }

  // Batch-create all matched items
  if (itemsToCreate.length > 0) {
    await prisma.submittalItem.createMany({ data: itemsToCreate })
  }

  return NextResponse.json({ imported, unmatched })
}
