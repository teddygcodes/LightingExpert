/**
 * Standalone crawl script for Atlantis KB Lighting Expert.
 * Run with: npm run crawl [-- --categories=interior-lighting,exterior-lighting]
 *
 * This runs outside of Next.js (no serverless constraints).
 * Results are written directly to the database.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ override: true })  // override: true ensures .env values replace any empty shell env vars
import { PrismaClient, Prisma } from '@prisma/client'
import { crawlElite, EliteProduct, ELITE_ROOT_CATEGORY_PATHS } from '../lib/crawler/elite'
import { crawlAcuity, AcuityProduct, ACUITY_ROOT_CATEGORY_PATHS } from '../lib/crawler/acuity'
import { crawlCooper, CooperProduct, COOPER_ROOT_CATEGORY_PATHS } from '../lib/crawler/cooper'
import { crawlCurrent, CurrentProduct, CURRENT_ROOT_CATEGORY_PATHS } from '../lib/crawler/current'
import { crawlLutron, LutronProduct, LUTRON_ROOT_CATEGORY_PATHS } from '../lib/crawler/lutron'
import { crawlAcuityCS, AcuityCsProduct, ACUITY_CS_ROOT_CATEGORY_PATHS } from '../lib/crawler/acuity-cs'
import {
  normalizeVoltage,
  normalizeDimmingTypes,
  normalizeMountingTypes,
} from '../lib/crawler/normalize'
import { AiBudget } from '../lib/crawler/config'

const prisma = new PrismaClient()

// Ensure Prisma disconnects on exit
process.on('exit', () => { prisma.$disconnect() })
process.on('SIGINT', () => { prisma.$disconnect().then(() => process.exit(130)) })
process.on('SIGTERM', () => { prisma.$disconnect().then(() => process.exit(143)) })

// Parse CLI args
// --manufacturer=elite|acuity (default: elite)
// --categories=slug1,slug2 (default: all categories for the manufacturer)
const args = process.argv.slice(2)
const manufacturerArg = args.find((a) => a.startsWith('--manufacturer='))
const manufacturer = manufacturerArg ? manufacturerArg.replace('--manufacturer=', '').trim() : 'elite'

const familiesArg = args.find((a) => a.startsWith('--families='))
const familiesToCrawl = familiesArg
  ? familiesArg.replace('--families=', '').split(',').map(s => s.trim()).filter(Boolean)
  : undefined

const aiBudgetArg = args.find((a) => a.startsWith('--ai-budget='))
const aiBudgetMax = aiBudgetArg ? parseInt(aiBudgetArg.replace('--ai-budget=', ''), 10) || 50 : 50
const aiBudget = new AiBudget(aiBudgetMax)

const categoriesArg = args.find((a) => a.startsWith('--categories='))
const defaultCategories = manufacturer === 'acuity'
  ? Object.keys(ACUITY_ROOT_CATEGORY_PATHS)
  : manufacturer === 'acuity-cs'
    ? Object.keys(ACUITY_CS_ROOT_CATEGORY_PATHS)
    : manufacturer === 'cooper'
      ? Object.keys(COOPER_ROOT_CATEGORY_PATHS)
      : manufacturer === 'current'
        ? Object.keys(CURRENT_ROOT_CATEGORY_PATHS)
        : manufacturer === 'lutron'
          ? Object.keys(LUTRON_ROOT_CATEGORY_PATHS)
          : Object.keys(ELITE_ROOT_CATEGORY_PATHS)
const categories = categoriesArg
  ? categoriesArg.replace('--categories=', '').split(',').map(s => s.trim()).filter(Boolean)
  : defaultCategories

interface CrawlStats {
  found: number
  new: number
  updated: number
  cached: number
  failures: number
  confidenceSum: number
}

async function run() {
  console.log('=== Atlantis KB Lighting Crawl ===')
  console.log(`Manufacturer: ${manufacturer}`)
  console.log(`Categories: ${categories.join(', ')}`)
  console.log(`AI Budget: ${aiBudgetMax} calls`)
  console.log(`Started: ${new Date().toISOString()}`)
  console.log('')

  // Resolve the active manufacturer record
  // acuity-cs is a separate crawl but stores products under the acuity manufacturer
  const dbSlug = manufacturer === 'acuity-cs' ? 'acuity' : manufacturer
  const manufacturerRecord = await prisma.manufacturer.findUnique({ where: { slug: dbSlug } })
  if (!manufacturerRecord) {
    console.error(`Error: Manufacturer "${dbSlug}" not found. Run: npm run db:seed`)
    process.exit(1)
  }

  // Keep legacy variable name for Elite to avoid downstream changes
  const elite = manufacturerRecord

  // Load root categories from DB — used for categoryId resolution
  const rootCategoryRows = await prisma.category.findMany({
    where: { manufacturerId: elite.id, parentId: null },
    select: { id: true, slug: true },
  })
  const rootCategoryMap = new Map(rootCategoryRows.map(c => [c.slug, c.id]))

  if (rootCategoryMap.size === 0) {
    console.error('Error: No root categories found. Run: npm run db:seed')
    process.exit(1)
  }
  console.log(`Loaded ${rootCategoryMap.size} root categories: ${[...rootCategoryMap.keys()].join(', ')}`)

  // Family sub-category cache — avoids repeated DB upserts for the same family
  const familyCategoryCache = new Map<string, string>() // familyPath → categoryId

  // Cleanup orphaned RUNNING logs — only those older than 3 hours (safely past any live crawl)
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
  await prisma.crawlLog.updateMany({
    where: { manufacturerId: elite.id, status: 'RUNNING', startedAt: { lt: threeHoursAgo } },
    data: { status: 'INTERRUPTED', completedAt: new Date() },
  })

  // Create crawl log
  const crawlLog = await prisma.crawlLog.create({
    data: {
      manufacturerId: elite.id,
      status: 'RUNNING',
      categories,
    },
  })

  // Graceful shutdown: mark log as INTERRUPTED on Ctrl+C or process kill
  const handleExit = async (signal: string) => {
    console.log(`\n[Crawl] Received ${signal}, marking crawl as INTERRUPTED...`)
    try {
      await prisma.crawlLog.update({
        where: { id: crawlLog.id },
        data: { status: 'INTERRUPTED', completedAt: new Date() },
      })
    } catch {}
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on('SIGINT', () => { handleExit('SIGINT') })
  process.on('SIGTERM', () => { handleExit('SIGTERM') })

  const stats: CrawlStats = {
    found: 0,
    new: 0,
    updated: 0,
    cached: 0,
    failures: 0,
    confidenceSum: 0,
  }
  const errors: string[] = []

  // Pre-crawl cleanup: remove certification/filter sub-categories that are not real product families.
  // These can be created by misconfigured earlier crawl runs (e.g., 'energy-star' from ?characteristics=).
  const INVALID_FAMILY_SLUGS = ['energy-star', 'dlc', 'dlc-premium', 'baba', 'declare', 'selecctor']
  for (const rootSlug of categories) {
    const rootCatId = rootCategoryMap.get(rootSlug)
    if (!rootCatId) continue
    const stale = await prisma.category.findMany({
      where: {
        parentId: rootCatId,
        OR: [
          { slug: { in: INVALID_FAMILY_SLUGS } },
          { slug: { contains: '?' } },  // catch URL-param slugs like "?characteristics=energy-star"
        ],
      },
      select: { id: true, slug: true },
    })
    if (stale.length > 0) {
      const staleIds = stale.map(c => c.id)
      await prisma.product.updateMany({ where: { categoryId: { in: staleIds } }, data: { categoryId: null } })
      await prisma.category.deleteMany({ where: { id: { in: staleIds } } })
      console.log(`[Cleanup] Removed stale categories for ${rootSlug}: ${stale.map(c => c.slug).join(', ')}`)
    }
  }

  try {
    // Route to the correct manufacturer crawler
    let products: (EliteProduct | AcuityProduct | AcuityCsProduct | CooperProduct | CurrentProduct | LutronProduct)[]
    if (manufacturer === 'acuity') {
      products = await crawlAcuity(categories)
    } else if (manufacturer === 'acuity-cs') {
      products = await crawlAcuityCS(categories)
    } else if (manufacturer === 'cooper') {
      products = await crawlCooper(categories)
    } else if (manufacturer === 'current') {
      products = await crawlCurrent(categories)
    } else if (manufacturer === 'lutron') {
      products = await crawlLutron(categories)
    } else {
      products = await crawlElite(categories, familiesToCrawl)
    }
    stats.found = products.length

    // Zero-product detection — warn if site structure may have changed
    if (products.length === 0 && categories.length > 0) {
      const warning = `ZERO_PRODUCTS: ${manufacturer} returned 0 products for categories: ${categories.join(', ')}. Site structure may have changed.`
      console.error(`\n[WARNING] ${warning}\n`)
      errors.push(warning)
    }

    // Check against last successful crawl for suspicious drop
    if (products.length > 0) {
      const lastGood = await prisma.crawlLog.findFirst({
        where: { manufacturerId: elite.id, status: 'COMPLETED', productsFound: { gt: 0 } },
        orderBy: { startedAt: 'desc' },
        select: { productsFound: true },
      })
      if (lastGood && products.length < lastGood.productsFound * 0.1) {
        const warning = `PRODUCT_DROP: Found ${products.length} products, but last successful crawl found ${lastGood.productsFound}. Possible site structure change.`
        console.warn(`[WARNING] ${warning}`)
        errors.push(warning)
      }
    }

    for (let i = 0; i < products.length; i++) {
      const p = products[i]
      try {
        await upsertProduct(p as EliteProduct, elite.id, rootCategoryMap, familyCategoryCache, stats)
      } catch (err: unknown) {
        stats.failures++
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${p.catalogNumber}: ${msg}`)
        console.error(`[DB] Failed to save ${p.catalogNumber}:`, msg)
      }

      // Incremental progress save every 100 products
      if ((i + 1) % 100 === 0) {
        await prisma.crawlLog.update({
          where: { id: crawlLog.id },
          data: {
            productsFound: stats.found,
            productsNew: stats.new,
            productsUpdated: stats.updated,
            productsCached: stats.cached,
            parseFailures: stats.failures,
          },
        })
        console.log(`[Progress] ${i + 1}/${products.length} processed`)
      }
    }

    const avgConfidence = stats.found > 0 ? stats.confidenceSum / stats.found : 0

    // Update crawl log
    await prisma.crawlLog.update({
      where: { id: crawlLog.id },
      data: {
        status: errors.length > 0 ? 'PARTIAL' : 'COMPLETED',
        productsFound: stats.found,
        productsNew: stats.new,
        productsUpdated: stats.updated,
        productsCached: stats.cached,
        parseFailures: stats.failures,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        errors: errors.length > 0 ? (errors as Prisma.InputJsonValue) : Prisma.JsonNull,
        completedAt: new Date(),
      },
    })

    console.log('\n=== Crawl Complete ===')
    console.log(`Found:    ${stats.found}`)
    console.log(`New:      ${stats.new}`)
    console.log(`Updated:  ${stats.updated}`)
    console.log(`Failures: ${stats.failures}`)
    console.log(`Avg Confidence: ${(avgConfidence * 100).toFixed(0)}%`)
    console.log(`AI Calls: ${aiBudget.totalUsed}/${aiBudgetMax}`)
    console.log(`Families created/upserted: ${familyCategoryCache.size}`)
    if (errors.length > 0) {
      console.log(`\nErrors (${errors.length}):`)
      errors.slice(0, 5).forEach((e) => console.log(' -', e))
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal crawl error:', msg)
    await prisma.crawlLog.update({
      where: { id: crawlLog.id },
      data: {
        status: 'FAILED',
        errors: [msg] as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    })
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

async function upsertProduct(
  p: EliteProduct,
  manufacturerId: string,
  rootCategoryMap: Map<string, string>,
  familyCategoryCache: Map<string, string>,
  stats: CrawlStats
) {
  const existing = await prisma.product.findUnique({
    where: { manufacturerId_catalogNumber: { manufacturerId, catalogNumber: p.catalogNumber } },
  })

  // ── Resolve categoryId ──────────────────────────────────────────────────────
  let categoryId: string | undefined

  if (p.rootCategorySlug && p.categoryFamilySlug) {
    const familyPath = `${p.rootCategorySlug}/${p.categoryFamilySlug}`

    if (!familyCategoryCache.has(familyPath)) {
      const rootId = rootCategoryMap.get(p.rootCategorySlug)
      if (rootId) {
        // Upsert the sub-category (product family) node
        const family = await prisma.category.upsert({
          where: { manufacturerId_path: { manufacturerId, path: familyPath } },
          update: {
            name: p.categoryFamilyName ?? p.categoryFamilySlug,
            sourceUrl: p.categoryFamilySourceUrl,
          },
          create: {
            manufacturerId,
            parentId: rootId,
            name: p.categoryFamilyName ?? p.categoryFamilySlug,
            slug: p.categoryFamilySlug,
            path: familyPath,
            sourceUrl: p.categoryFamilySourceUrl,
          },
        })
        familyCategoryCache.set(familyPath, family.id)
      }
    }

    categoryId = familyCategoryCache.get(familyPath)
  } else if (p.rootCategorySlug) {
    // No family — assign directly to root category
    categoryId = rootCategoryMap.get(p.rootCategorySlug)
  }

  // ── Build product data ──────────────────────────────────────────────────────
  const s = p.specs
  const voltage = s.voltage ? normalizeVoltage(String(s.voltage)) : undefined
  const dimmingType = s.dimmingType ? normalizeDimmingTypes(String(s.dimmingType)) : []
  const mountingType = s.mountingType ? normalizeMountingTypes(String(s.mountingType)) : []

  const data: Prisma.ProductUncheckedCreateInput = {
    manufacturerId,
    categoryId,
    catalogNumber: p.catalogNumber,
    displayName: p.displayName,
    familyName: p.familyName,
    productPageUrl: p.productPageUrl,
    specSheetUrl: p.specSheetUrl,
    specSheetPath: p.specSheetPath,
    specSheets: (p as { specSheets?: unknown }).specSheets ?? undefined,
    voltage,
    dimmingType,
    mountingType,
    wattage: toFloat(s.wattage),
    wattageMin: toFloat(s.wattageMin),
    wattageMax: toFloat(s.wattageMax),
    lumens: toInt(s.lumens),
    lumensMin: toInt(s.lumensMin),
    lumensMax: toInt(s.lumensMax),
    cri: toInt(s.cri),
    cctOptions: Array.isArray(s.cctOptions) ? s.cctOptions.map(Number) : [],
    dimmable: toBool(s.dimmable),
    dlcListed: toBool(s.dlcListed),
    dlcPremium: toBool(s.dlcPremium),
    ulListed: toBool(s.ulListed),
    wetLocation: toBool(s.wetLocation),
    dampLocation: toBool(s.dampLocation),
    efficacy: toFloat(s.efficacy),
    beamAngle: toFloat(s.beamAngle),
    dimensions: s.dimensions ? String(s.dimensions) : undefined,
    formFactor: s.formFactor ? String(s.formFactor) : undefined,
    ipRating: s.ipRating ? String(s.ipRating) : undefined,
    nemaRating: s.nemaRating ? String(s.nemaRating) : undefined,
    emergencyBackup: toBool(s.emergencyBackup),
    fieldProvenance: p.provenance as Prisma.InputJsonValue,
    overallConfidence: p.overallConfidence,
    crawlEvidence: p.crawlEvidence as unknown as Prisma.InputJsonValue,
    configOptions: p.configOptions ? p.configOptions as Prisma.InputJsonValue : undefined,
    lastCrawled: new Date(),
  }

  if (existing) {
    // Protect MANUAL fields
    const existingProvenance = (existing.fieldProvenance as Record<string, { source: string; confidence: number }>) || {}
    const updateData: Prisma.ProductUncheckedUpdateInput = { ...data }
    for (const [key, prov] of Object.entries(existingProvenance)) {
      if (prov.source === 'MANUAL') {
        delete (updateData as Record<string, unknown>)[key]
      }
    }

    await prisma.product.update({ where: { id: existing.id }, data: updateData })
    stats.updated++
    if (p.specSheetPath) stats.cached++
  } else {
    await prisma.product.create({ data })
    stats.new++
  }

  stats.confidenceSum += p.overallConfidence
}

function toFloat(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = parseFloat(String(v))
  return isNaN(n) ? undefined : n
}

function toInt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = parseInt(String(v))
  return isNaN(n) ? undefined : n
}

function toBool(v: unknown): boolean | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase()
  if (s === 'true' || s === 'yes' || s === '1') return true
  if (s === 'false' || s === 'no' || s === '0') return false
  return undefined
}

run()
