import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError } from '@/lib/api-response'
import { updateBrandingSchema, zodError } from '@/lib/validations'

export async function GET() {
  const branding = await prisma.companyBranding.findFirst()
  return NextResponse.json(branding ?? {})
}

export async function PUT(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON in request body', 400)
  }

  const parsed = updateBrandingSchema.safeParse(body)
  if (!parsed.success) return zodError(parsed)

  const {
    companyName, address, phone, email, website, logoBase64, logoMimeType,
    preparedByName, preparedByTitle, preparedByPhone, preparedByEmail,
  } = parsed.data

  const existing = await prisma.companyBranding.findFirst()

  const data = {
    companyName:     companyName     ?? null,
    address:         address         ?? null,
    phone:           phone           ?? null,
    email:           email           ?? null,
    website:         website         ?? null,
    preparedByName:  preparedByName  ?? null,
    preparedByTitle: preparedByTitle ?? null,
    preparedByPhone: preparedByPhone ?? null,
    preparedByEmail: preparedByEmail ?? null,
    ...(logoBase64   !== undefined && { logoBase64:   logoBase64   ?? null }),
    ...(logoMimeType !== undefined && { logoMimeType: logoMimeType ?? null }),
  }

  const branding = existing
    ? await prisma.companyBranding.update({ where: { id: existing.id }, data })
    : await prisma.companyBranding.create({ data })

  return NextResponse.json(branding)
}
