import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // ─── Manufacturers ─────────────────────────────────────────────────────────
  const manufacturers = [
    { name: 'Elite Lighting',    slug: 'elite',    website: 'https://iuseelite.com' },
    { name: 'Acuity Brands',     slug: 'acuity',   website: 'https://acuitybrands.com' },
    { name: 'Cooper Lighting',   slug: 'cooper',   website: 'https://cooperlighting.com' },
    { name: 'Current Lighting',  slug: 'current',  website: 'https://www.currentlighting.com' },
  ]

  for (const m of manufacturers) {
    await prisma.manufacturer.upsert({
      where: { slug: m.slug },
      update: {},
      create: m,
    })
  }

  // ─── Safety guard — never wipe products via seed ──────────────────────────
  // Products are populated by crawlers only. Seed is idempotent (upsert-only).
  // To do a full reset intentionally, run: FORCE_RESET=1 npm run db:seed
  if (process.env.FORCE_RESET === '1') {
    console.warn('⚠️  FORCE_RESET=1 detected — wiping all data...')
    await prisma.submittalItem.deleteMany({})
    await prisma.crossReference.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.category.deleteMany({})
    console.warn('⚠️  All data wiped. Re-run crawlers to repopulate.')
  }

  // ─── Elite Lighting — 5 top-level browse categories ───────────────────────
  // The 7 remaining dropdown items (Energy Star, DLC, etc.) are cross-cutting
  // attribute filters that duplicate products across categories — skip them.
  const elite = await prisma.manufacturer.findUniqueOrThrow({ where: { slug: 'elite' } })

  const ELITE_CATEGORIES = [
    'Interior Lighting',
    'Exterior Lighting',
  ]

  for (let i = 0; i < ELITE_CATEGORIES.length; i++) {
    const name = ELITE_CATEGORIES[i]
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    await prisma.category.upsert({
      where: { manufacturerId_path: { manufacturerId: elite.id, path: slug } },
      update: { name, sortOrder: i },
      create: { manufacturerId: elite.id, name, slug, path: slug, sortOrder: i },
    })
  }

  // ─── Acuity Brands — 10 top-level browse categories ──────────────────────────
  const acuity = await prisma.manufacturer.findUniqueOrThrow({ where: { slug: 'acuity' } })

  const ACUITY_CATEGORIES = [
    { name: 'Indoor',                slug: 'indoor' },
    { name: 'Outdoor',               slug: 'outdoor' },
    { name: 'Residential',           slug: 'residential' },
    { name: 'Industrial',            slug: 'industrial' },
    { name: 'Life Safety',           slug: 'life-safety' },
    { name: 'Confinement/Vandal',    slug: 'confinement-vandal' },
    { name: 'Controls',              slug: 'controls' },
    { name: 'Downlights',            slug: 'downlights' },
  ]

  for (let i = 0; i < ACUITY_CATEGORIES.length; i++) {
    const { name, slug } = ACUITY_CATEGORIES[i]
    await prisma.category.upsert({
      where: { manufacturerId_path: { manufacturerId: acuity.id, path: slug } },
      update: { name, sortOrder: i },
      create: { manufacturerId: acuity.id, name, slug, path: slug, sortOrder: i },
    })
  }

  // ─── Current Lighting — 3 top-level browse categories ────────────────────────
  const current = await prisma.manufacturer.findUniqueOrThrow({ where: { slug: 'current' } })

  const CURRENT_ROOT_CATEGORIES = [
    { name: 'Indoor',   slug: 'indoor' },
    { name: 'Outdoor',  slug: 'outdoor' },
    { name: 'Controls', slug: 'controls' },
  ]

  for (let i = 0; i < CURRENT_ROOT_CATEGORIES.length; i++) {
    const { name, slug } = CURRENT_ROOT_CATEGORIES[i]
    await prisma.category.upsert({
      where: { manufacturerId_path: { manufacturerId: current.id, path: slug } },
      update: { name, sortOrder: i },
      create: { manufacturerId: current.id, name, slug, path: slug, sortOrder: i },
    })
  }

  // ─── Cooper Lighting — 3 top-level browse categories ─────────────────────────
  const cooper = await prisma.manufacturer.findUniqueOrThrow({ where: { slug: 'cooper' } })

  const COOPER_ROOT_CATEGORIES = [
    { name: 'Indoor',   slug: 'indoor' },
    { name: 'Outdoor',  slug: 'outdoor' },
    { name: 'Controls', slug: 'controls' },
  ]

  for (let i = 0; i < COOPER_ROOT_CATEGORIES.length; i++) {
    const { name, slug } = COOPER_ROOT_CATEGORIES[i]
    await prisma.category.upsert({
      where: { manufacturerId_path: { manufacturerId: cooper.id, path: slug } },
      update: { name, sortOrder: i },
      create: { manufacturerId: cooper.id, name, slug, path: slug, sortOrder: i },
    })
  }

  // ─── Lutron — 2 top-level browse categories ───────────────────────────────
  await prisma.manufacturer.upsert({
    where: { slug: 'lutron' },
    update: { name: 'Lutron' },
    create: { name: 'Lutron', slug: 'lutron', website: 'https://www.lutron.com' },
  })
  const lutron = await prisma.manufacturer.findUniqueOrThrow({ where: { slug: 'lutron' } })

  const LUTRON_ROOT_CATEGORIES = [
    { name: 'Lighting',  slug: 'lighting' },
    { name: 'Controls',  slug: 'controls' },
  ]

  for (let i = 0; i < LUTRON_ROOT_CATEGORIES.length; i++) {
    const { name, slug } = LUTRON_ROOT_CATEGORIES[i]
    await prisma.category.upsert({
      where: { manufacturerId_path: { manufacturerId: lutron.id, path: slug } },
      update: { name, sortOrder: i },
      create: { manufacturerId: lutron.id, name, slug, path: slug, sortOrder: i },
    })
  }

  // ─── Acuity Contractor Select — 11 top-level browse categories ───────────────
  await prisma.manufacturer.upsert({
    where: { slug: 'acuity-cs' },
    update: { name: 'Acuity Contractor Select' },
    create: {
      name: 'Acuity Contractor Select',
      slug: 'acuity-cs',
      website: 'https://www.acuitybrands.com/resources/programs/contractor-select',
    },
  })
  const acuityCS = await prisma.manufacturer.findUniqueOrThrow({ where: { slug: 'acuity-cs' } })

  const ACUITY_CS_ROOT_CATEGORIES = [
    { name: 'Downlights',                      slug: 'downlights' },
    { name: 'Panels, Troffers & Wraparounds',  slug: 'panels-troffers-wraparounds' },
    { name: 'Highbay & Strip Lights',          slug: 'highbay-strip' },
    { name: 'Outdoor',                         slug: 'outdoor' },
    { name: 'Controls',                        slug: 'controls' },
    { name: 'Emergency & Exit',                slug: 'emergency-exit' },
    { name: 'Programmable LED Drivers',        slug: 'programmable-drivers' },
    { name: 'Surface / Flush Mount',           slug: 'surface-flush-mount' },
    { name: 'Switchable',                      slug: 'switchable' },
    { name: 'Undercabinet',                    slug: 'undercabinet' },
    { name: 'Vanities',                        slug: 'vanities' },
  ]

  for (let i = 0; i < ACUITY_CS_ROOT_CATEGORIES.length; i++) {
    const { name, slug } = ACUITY_CS_ROOT_CATEGORIES[i]
    await prisma.category.upsert({
      where: { manufacturerId_path: { manufacturerId: acuityCS.id, path: slug } },
      update: { name, sortOrder: i },
      create: { manufacturerId: acuityCS.id, name, slug, path: slug, sortOrder: i },
    })
  }

  console.log('Seeded 6 manufacturers: 2 Elite, 8 Acuity, 3 Cooper, 3 Current Lighting, 2 Lutron, and 11 Acuity Contractor Select top-level categories.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
