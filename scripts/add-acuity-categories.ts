/**
 * One-time script: safely adds Acuity Brands root categories to the DB.
 * Does NOT delete any existing data.
 * Run with: npx ts-node --project tsconfig.scripts.json scripts/add-acuity-categories.ts
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ override: true })
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ACUITY_CATEGORIES = [
  { name: 'Indoor',                slug: 'indoor' },
  { name: 'Outdoor',               slug: 'outdoor' },
  { name: 'Residential',           slug: 'residential' },
  { name: 'Industrial',            slug: 'industrial' },
  { name: 'Contractor Select',     slug: 'contractor-select' },
  { name: 'Design Select',         slug: 'design-select' },
  { name: 'Life Safety',           slug: 'life-safety' },
  { name: 'Confinement/Vandal',    slug: 'confinement-vandal' },
  { name: 'Healthcare',            slug: 'healthcare' },
  { name: 'Horticulture Lighting', slug: 'horticulture-lighting' },
]

async function main() {
  const acuity = await prisma.manufacturer.findUnique({ where: { slug: 'acuity' } })
  if (!acuity) {
    console.error('Acuity Brands manufacturer not found in DB.')
    process.exit(1)
  }

  for (let i = 0; i < ACUITY_CATEGORIES.length; i++) {
    const { name, slug } = ACUITY_CATEGORIES[i]
    const existing = await prisma.category.findUnique({
      where: { manufacturerId_path: { manufacturerId: acuity.id, path: slug } },
    })
    await prisma.category.upsert({
      where: { manufacturerId_path: { manufacturerId: acuity.id, path: slug } },
      update: { name, sortOrder: i },
      create: { manufacturerId: acuity.id, name, slug, path: slug, sortOrder: i },
    })
    console.log(`  ${existing ? 'Exists' : 'Added '}: ${slug}`)
  }

  console.log('\nDone.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
