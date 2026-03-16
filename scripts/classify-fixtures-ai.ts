// scripts/classify-fixtures-ai.ts
import { config as loadEnv } from 'dotenv'
loadEnv()

import { prisma } from '../lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { CanonicalFixtureType } from '@prisma/client'

const VALID_TYPES = [
  'HIGH_BAY', 'LOW_BAY', 'TROFFER', 'FLAT_PANEL', 'DOWNLIGHT', 'RECESSED_CAN',
  'CYLINDER', 'VAPOR_TIGHT', 'WALL_PACK', 'WALL_MOUNT', 'SCONCE', 'FLOOD',
  'AREA_SITE', 'ROADWAY', 'CANOPY', 'GARAGE', 'LINEAR_SUSPENDED', 'LINEAR_SURFACE',
  'LINEAR_SLOT', 'STRIP', 'WRAP', 'PENDANT', 'SURFACE_MOUNT', 'TRACK', 'BOLLARD',
  'LANDSCAPE', 'POST_TOP', 'STEP_LIGHT', 'UNDER_CABINET', 'EXIT_EMERGENCY',
  'VANITY', 'COVE', 'RETROFIT_KIT', 'CONTROLS', 'SENSOR', 'DRIVER', 'POWER_SUPPLY',
  'MODULAR_WIRING', 'POLE', 'ARM_BRACKET', 'ACCESSORY', 'SPORTS_LIGHTING', 'UV_C',
  'SURGICAL', 'CLEANROOM', 'VANDAL_RESISTANT', 'BEHAVIORAL', 'DECORATIVE', 'OTHER',
]

async function classifyWithAI() {
  const anthropic = new Anthropic()
  const unclassified = await prisma.product.findMany({
    where: { isActive: true, canonicalFixtureType: null },
    select: {
      id: true,
      catalogNumber: true,
      displayName: true,
      familyName: true,
      description: true,
      manufacturer: { select: { name: true } },
      category: { select: { name: true, slug: true, path: true } },
    },
  })

  console.log(`${unclassified.length} products need AI classification`)

  if (unclassified.length === 0) {
    console.log('All products already classified. Done.')
    return
  }

  // Process in batches of 20
  const BATCH_SIZE = 20
  let classified = 0
  let failed = 0

  for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
    const batch = unclassified.slice(i, i + BATCH_SIZE)

    const productDescriptions = batch.map((p, idx) => {
      const parts = [
        `${idx + 1}. Catalog: ${p.catalogNumber}`,
        p.displayName ? `   Name: ${p.displayName}` : null,
        p.familyName ? `   Family: ${p.familyName}` : null,
        p.manufacturer ? `   Manufacturer: ${p.manufacturer.name}` : null,
        p.category?.name ? `   Category: ${p.category.name}` : null,
        p.category?.path ? `   Category Path: ${p.category.path}` : null,
        p.description ? `   Description: ${p.description.substring(0, 200)}` : null,
      ].filter(Boolean)
      return parts.join('\n')
    }).join('\n\n')

    const prompt = `Classify each lighting product into exactly one canonical fixture type.

Valid types: ${VALID_TYPES.join(', ')}

For each product, respond with ONLY the product number and type, one per line. Example:
1. HIGH_BAY
2. TROFFER
3. DOWNLIGHT

If you cannot determine the type, use OTHER.

Products to classify:

${productDescriptions}`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const lines = text.trim().split('\n')

      for (const line of lines) {
        const match = line.match(/^(\d+)\.\s*(\w+)/)
        if (!match) continue

        const idx = parseInt(match[1]) - 1
        const typeStr = match[2].toUpperCase()

        if (idx < 0 || idx >= batch.length) continue
        if (!VALID_TYPES.includes(typeStr)) continue

        const product = batch[idx]

        await prisma.product.update({
          where: { id: product.id },
          data: {
            canonicalFixtureType: typeStr as CanonicalFixtureType,
            canonicalFixtureConfidence: 0.75,
            canonicalFixtureSource: 'AI_CLASSIFIED',
            canonicalFixtureEvidence: `Claude classified from: catalog="${product.catalogNumber}", name="${product.displayName}", category="${product.category?.name}"`,
          },
        })
        classified++
      }
    } catch (err) {
      console.error(`Batch starting at ${i} failed:`, err)
      failed += batch.length
    }

    console.log(`Processed ${Math.min(i + BATCH_SIZE, unclassified.length)}/${unclassified.length} (${classified} classified, ${failed} failed)`)

    // Rate limit: 1 second between batches
    await new Promise(r => setTimeout(r, 1000))
  }

  // Final count
  const stillNull = await prisma.product.count({
    where: { isActive: true, canonicalFixtureType: null },
  })

  console.log(`\nDone. ${classified} classified by AI, ${failed} failed, ${stillNull} still unclassified.`)
}

classifyWithAI().catch(console.error).finally(() => prisma.$disconnect())
