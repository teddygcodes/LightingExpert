import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const branding = await prisma.companyBranding.findFirst()
  return NextResponse.json(branding ?? {})
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const {
    companyName, address, phone, email, website, logoBase64, logoMimeType,
    preparedByName, preparedByTitle, preparedByPhone, preparedByEmail,
  } = body

  if (logoMimeType && !['image/png', 'image/jpeg'].includes(logoMimeType)) {
    return NextResponse.json({ error: 'Invalid logo type' }, { status: 400 })
  }

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
