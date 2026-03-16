// scripts/classify-fixtures.ts
import { prisma } from '../lib/db'
import { CanonicalFixtureType } from '@prisma/client'

// ─── Pass 1: Category path segment → canonical type ─────────────────────────
// Most authoritative. Category paths like "indoor/bay-lighting" or
// "interior-lighting/high-bay-low-bay" are ground truth from manual organization.

const PATH_SEGMENT_MAP: Record<string, CanonicalFixtureType> = {
  // High Bay / Low Bay
  'high-bay':           'HIGH_BAY',
  'low-bay':            'LOW_BAY',
  'bay-lighting':       'HIGH_BAY',
  'high-bay-low-bay':   'HIGH_BAY',
  'linear-high-bays':   'HIGH_BAY',
  'round-high-bays':    'HIGH_BAY',
  'high-bays':          'HIGH_BAY',
  'low-bays':           'LOW_BAY',

  // Troffers & Panels
  'troffers':           'TROFFER',
  'troffer':            'TROFFER',
  'troffers-panels':    'TROFFER',
  'flat-panel':         'FLAT_PANEL',
  'panels':             'FLAT_PANEL',
  'decorative-troffer': 'TROFFER',
  'troffer-parabolic':  'TROFFER',
  't-bar-led':          'TROFFER',
  '2x4':                'TROFFER',
  '2x2':                'FLAT_PANEL',
  '1x4':                'TROFFER',

  // Downlights
  'downlights':         'DOWNLIGHT',
  'downlight':          'DOWNLIGHT',
  'downlighting':       'DOWNLIGHT',
  'accent-downlighting':'DOWNLIGHT',
  'adjustable-downlighting': 'DOWNLIGHT',
  'wall-wash-downlighting':  'DOWNLIGHT',
  'general-purpose-downlighting': 'DOWNLIGHT',
  'residential-ic-non-ic-downlighting': 'DOWNLIGHT',
  'residential-downlighting': 'DOWNLIGHT',
  'recessed':           'RECESSED_CAN',
  'recessed-volumetric':'DOWNLIGHT',
  'view-all-downlights':'DOWNLIGHT',

  // Cylinders
  'cylinders':          'CYLINDER',
  'architectural-cylinders': 'CYLINDER',
  'outdoor-cylinders':  'CYLINDER',

  // Vapor Tight / Enclosed
  'vapor-tight':        'VAPOR_TIGHT',
  'enclosed-gasketed':  'VAPOR_TIGHT',
  'vaporproof':         'VAPOR_TIGHT',

  // Wall Pack
  'wall-pack':          'WALL_PACK',
  'wall-packs':         'WALL_PACK',
  'outdoor-wall-packs-lighting': 'WALL_PACK',

  // Wall Mount
  'wall-mount':         'WALL_MOUNT',
  'wall-brackets':      'WALL_MOUNT',
  'wall-sconce':        'SCONCE',
  'sconces':            'SCONCE',
  'outdoor-wall-mount': 'WALL_MOUNT',
  'indoor-wall-mount':  'WALL_MOUNT',
  'surface-wall-mount': 'WALL_MOUNT',
  'decorative-wall-mount': 'WALL_MOUNT',

  // Flood
  'flood':              'FLOOD',
  'floods':             'FLOOD',
  'floodlighting':      'FLOOD',
  'flood-lighting':     'FLOOD',
  'floodlighting-landscape': 'FLOOD',

  // Area / Site / Roadway
  'area-site':          'AREA_SITE',
  'area-site-roadway':  'AREA_SITE',
  'area-and-site':      'AREA_SITE',
  'area-light':         'AREA_SITE',
  'area-site-lighting': 'AREA_SITE',
  'site-light':         'AREA_SITE',
  'roadway':            'ROADWAY',

  // Canopy / Garage
  'canopy':             'CANOPY',
  'canopy-garage':      'CANOPY',
  'garage-canopy-tunnel': 'CANOPY',
  'garage':             'GARAGE',

  // Linear
  'linear':             'LINEAR_SUSPENDED',
  'linear-suspended':   'LINEAR_SUSPENDED',
  'linear-slot':        'LINEAR_SLOT',
  'linear-strip':       'STRIP',
  'suspended-linear-slot': 'LINEAR_SLOT',
  'recessed-linear-slot':  'LINEAR_SLOT',
  'surface-mount-linear-slot': 'LINEAR_SURFACE',
  'wall-mount-linear-slot':    'LINEAR_SURFACE',
  'outdoor-linear':     'LINEAR_SUSPENDED',
  'groove-tension-48v': 'TRACK',

  // Strip
  'strip':              'STRIP',
  'strip-lights':       'STRIP',
  'commercial-strip-lights': 'STRIP',

  // Wrap
  'wrap':               'WRAP',
  'wraps':              'WRAP',

  // Pendant
  'pendant':            'PENDANT',
  'pendants':           'PENDANT',
  'architectural-pendant': 'PENDANT',
  'pendants-semi-flush': 'PENDANT',

  // Surface Mount
  'surface-mount':      'SURFACE_MOUNT',
  'surface-lighting':   'SURFACE_MOUNT',
  'flush-surface-mounts': 'SURFACE_MOUNT',

  // Track
  'track':              'TRACK',
  'track-lighting':     'TRACK',
  'track-fixtures':     'TRACK',
  'track-systems':      'TRACK',
  'lamps-track':        'TRACK',

  // Bollard / Landscape / Post Top
  'bollard':            'BOLLARD',
  'bollards':           'BOLLARD',
  'landscape':          'LANDSCAPE',
  'landscape-bollards': 'BOLLARD',
  'post-top':           'POST_TOP',
  'decorative-post-top':'POST_TOP',

  // Step Light
  'step-lights':        'STEP_LIGHT',
  'step-light':         'STEP_LIGHT',

  // Under Cabinet
  'under-cabinet':      'UNDER_CABINET',
  'undercabinet':       'UNDER_CABINET',
  'undercabinet-lighting': 'UNDER_CABINET',

  // Exit & Emergency
  'exit-emergency':     'EXIT_EMERGENCY',
  'exit-and-emergency': 'EXIT_EMERGENCY',
  'exit-message-signs': 'EXIT_EMERGENCY',
  'emergency-lighting-units': 'EXIT_EMERGENCY',
  'remote-heads-fixtures':    'EXIT_EMERGENCY',
  'battery-packs':      'EXIT_EMERGENCY',
  'replacement-batteries': 'EXIT_EMERGENCY',
  'central-lighting-inverters': 'EXIT_EMERGENCY',

  // Vanity / Mirror
  'vanity':             'VANITY',
  'mirror-lighting':    'VANITY',

  // Cove
  'cove':               'COVE',
  'cove-lighting':      'COVE',

  // Retrofit
  'retrofit':           'RETROFIT_KIT',
  'retrofit-kits':      'RETROFIT_KIT',
  'led-retrofit':       'RETROFIT_KIT',
  'tubes':              'RETROFIT_KIT',

  // Controls & Sensors
  'controls':           'CONTROLS',
  'commercial-controls':'CONTROLS',
  'infrastructure-controls': 'CONTROLS',
  'residential-controls':    'CONTROLS',
  'sports-controls':    'CONTROLS',
  'emergency-controls': 'CONTROLS',
  'sensors':            'SENSOR',
  'sensors-timers':     'SENSOR',
  'dimmers-switches':   'CONTROLS',
  'keypads-remotes':    'CONTROLS',
  'wallbox-devices':    'CONTROLS',
  'power-packs-relays': 'CONTROLS',
  'cx-control-panels':  'CONTROLS',
  'nx-control-panels':  'CONTROLS',
  'nx-connect':         'CONTROLS',
  'nx-wireless':        'CONTROLS',
  'nx-wired':           'CONTROLS',
  'lightgridplus':      'CONTROLS',
  'nx-outdoor-controls':'CONTROLS',
  'oem-controls':       'CONTROLS',

  // Drivers / Power
  'led-drivers':        'DRIVER',
  'lighting-transformers': 'POWER_SUPPLY',
  'surge-protectors':   'ACCESSORY',

  // Modular Wiring
  'modular-wiring':     'MODULAR_WIRING',
  'modular-wiring-systems': 'MODULAR_WIRING',

  // Poles & Arms
  'poles':              'POLE',
  'poles-brackets':     'POLE',
  'arms-brackets':      'ARM_BRACKET',

  // Accessories
  'accessories':        'ACCESSORY',
  'accessories-industrial': 'ACCESSORY',
  'accessories-emergency':  'ACCESSORY',

  // Specialty
  'sports-lighting':    'SPORTS_LIGHTING',
  'sport-light':        'SPORTS_LIGHTING',
  'uv-c-disinfection':  'UV_C',
  'uv-c':               'UV_C',
  'surgical-imaging':   'SURGICAL',
  'surgical-and-imaging':'SURGICAL',
  'cleanroom':          'CLEANROOM',
  'vandal':             'VANDAL_RESISTANT',
  'vandal-resistant':   'VANDAL_RESISTANT',
  'behavioral-spaces':  'BEHAVIORAL',
  'patient-room':       'SURFACE_MOUNT',

  // Decorative
  'decorative':         'DECORATIVE',
  'decorative-lamps':   'DECORATIVE',
  'contemporary':       'DECORATIVE',
  'traditional':        'DECORATIVE',
  'transitional':       'DECORATIVE',
}

// ─── Pass 2: Category name keyword matching ──────────────────────────────────
// For products whose path didn't match, try the category display name.

const NAME_KEYWORD_MAP: Array<{ pattern: RegExp; type: CanonicalFixtureType }> = [
  { pattern: /high.?bay/i, type: 'HIGH_BAY' },
  { pattern: /low.?bay/i, type: 'LOW_BAY' },
  { pattern: /bay.?light/i, type: 'HIGH_BAY' },
  { pattern: /troffer/i, type: 'TROFFER' },
  { pattern: /flat.?panel/i, type: 'FLAT_PANEL' },
  { pattern: /downlight/i, type: 'DOWNLIGHT' },
  { pattern: /recessed/i, type: 'DOWNLIGHT' },
  { pattern: /cylinder/i, type: 'CYLINDER' },
  { pattern: /vapor.?tight/i, type: 'VAPOR_TIGHT' },
  { pattern: /wall.?pack/i, type: 'WALL_PACK' },
  { pattern: /wall.?mount/i, type: 'WALL_MOUNT' },
  { pattern: /sconce/i, type: 'SCONCE' },
  { pattern: /flood/i, type: 'FLOOD' },
  { pattern: /area.?(light|site)/i, type: 'AREA_SITE' },
  { pattern: /roadway/i, type: 'ROADWAY' },
  { pattern: /canopy/i, type: 'CANOPY' },
  { pattern: /garage/i, type: 'GARAGE' },
  { pattern: /linear.?s(us|lot)/i, type: 'LINEAR_SUSPENDED' },
  { pattern: /\bstrip\b/i, type: 'STRIP' },
  { pattern: /\bwrap\b/i, type: 'WRAP' },
  { pattern: /pendant/i, type: 'PENDANT' },
  { pattern: /surface.?mount/i, type: 'SURFACE_MOUNT' },
  { pattern: /\btrack\b/i, type: 'TRACK' },
  { pattern: /bollard/i, type: 'BOLLARD' },
  { pattern: /landscape/i, type: 'LANDSCAPE' },
  { pattern: /post.?top/i, type: 'POST_TOP' },
  { pattern: /step.?light/i, type: 'STEP_LIGHT' },
  { pattern: /under.?cab/i, type: 'UNDER_CABINET' },
  { pattern: /exit|emergency/i, type: 'EXIT_EMERGENCY' },
  { pattern: /vanity|mirror.?light/i, type: 'VANITY' },
  { pattern: /\bcove\b/i, type: 'COVE' },
  { pattern: /retrofit/i, type: 'RETROFIT_KIT' },
  { pattern: /control|dimmer|switch|keypad/i, type: 'CONTROLS' },
  { pattern: /sensor|occupancy|timer/i, type: 'SENSOR' },
  { pattern: /driver/i, type: 'DRIVER' },
  { pattern: /transform/i, type: 'POWER_SUPPLY' },
  { pattern: /modular.?wir/i, type: 'MODULAR_WIRING' },
  { pattern: /\bpole\b/i, type: 'POLE' },
  { pattern: /sport/i, type: 'SPORTS_LIGHTING' },
  { pattern: /uv.?c|disinfect/i, type: 'UV_C' },
  { pattern: /surgical|imaging/i, type: 'SURGICAL' },
  { pattern: /cleanroom/i, type: 'CLEANROOM' },
  { pattern: /vandal/i, type: 'VANDAL_RESISTANT' },
  { pattern: /decorat/i, type: 'DECORATIVE' },
]

async function classifyProducts() {
  console.log('Loading all products with categories...')

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      catalogNumber: true,
      displayName: true,
      familyName: true,
      canonicalFixtureType: true,
      category: { select: { name: true, slug: true, path: true } },
    },
  })

  console.log(`Loaded ${products.length} products`)

  let pass1Count = 0
  let pass2Count = 0
  let pass3Count = 0
  let unclassified = 0
  let alreadyClassified = 0

  const updates: Array<{
    id: string
    type: CanonicalFixtureType
    confidence: number
    source: string
    evidence: string
  }> = []

  for (const product of products) {
    // Skip if already manually classified
    if (product.canonicalFixtureType) {
      alreadyClassified++
      continue
    }

    let classified = false

    // ── Pass 1: Category path segments ──
    if (product.category?.path) {
      const segments = product.category.path.toLowerCase().split('/')
      for (const seg of segments) {
        const type = PATH_SEGMENT_MAP[seg]
        if (type) {
          updates.push({
            id: product.id,
            type,
            confidence: 0.95,
            source: 'CATEGORY_PATH',
            evidence: `path segment "${seg}" in path "${product.category.path}"`,
          })
          pass1Count++
          classified = true
          break
        }
      }
    }

    // Also check slug directly
    if (!classified && product.category?.slug) {
      const type = PATH_SEGMENT_MAP[product.category.slug.toLowerCase()]
      if (type) {
        updates.push({
          id: product.id,
          type,
          confidence: 0.90,
          source: 'CATEGORY_PATH',
          evidence: `slug "${product.category.slug}"`,
        })
        pass1Count++
        classified = true
      }
    }

    // ── Pass 2: Category name keywords ──
    if (!classified && product.category?.name) {
      for (const { pattern, type } of NAME_KEYWORD_MAP) {
        if (pattern.test(product.category.name)) {
          updates.push({
            id: product.id,
            type,
            confidence: 0.85,
            source: 'CATEGORY_NAME',
            evidence: `category name "${product.category.name}" matched ${pattern}`,
          })
          pass2Count++
          classified = true
          break
        }
      }
    }

    // ── Pass 3: Display name / family name ──
    if (!classified) {
      const haystack = [
        product.displayName ?? '',
        product.familyName ?? '',
        product.catalogNumber ?? '',
      ].join(' ')

      for (const { pattern, type } of NAME_KEYWORD_MAP) {
        if (pattern.test(haystack)) {
          updates.push({
            id: product.id,
            type,
            confidence: 0.65,
            source: 'DISPLAY_NAME',
            evidence: `"${haystack.substring(0, 80)}" matched ${pattern}`,
          })
          pass3Count++
          classified = true
          break
        }
      }
    }

    if (!classified) {
      unclassified++
    }
  }

  // ── Write all updates ──
  console.log(`\nClassification results:`)
  console.log(`  Pass 1 (category path): ${pass1Count}`)
  console.log(`  Pass 2 (category name): ${pass2Count}`)
  console.log(`  Pass 3 (display name):  ${pass3Count}`)
  console.log(`  Already classified:     ${alreadyClassified}`)
  console.log(`  Unclassified:           ${unclassified}`)
  console.log(`  Total updates to write: ${updates.length}`)

  // Batch update in chunks of 100
  const CHUNK_SIZE = 100
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE)
    await Promise.all(
      chunk.map((u) =>
        prisma.product.update({
          where: { id: u.id },
          data: {
            canonicalFixtureType: u.type,
            canonicalFixtureConfidence: u.confidence,
            canonicalFixtureSource: u.source,
            canonicalFixtureEvidence: u.evidence,
          },
        })
      )
    )
    console.log(`  Written ${Math.min(i + CHUNK_SIZE, updates.length)}/${updates.length}`)
  }

  // ── Report unclassified products ──
  if (unclassified > 0) {
    console.log(`\n⚠️  ${unclassified} products could not be classified. Run npm run classify:ai to handle these.`)

    const unclassifiedProducts = await prisma.product.findMany({
      where: { isActive: true, canonicalFixtureType: null },
      select: { catalogNumber: true, displayName: true, familyName: true, manufacturer: { select: { name: true } } },
      take: 20,
    })
    console.log('\nSample unclassified:')
    for (const p of unclassifiedProducts) {
      console.log(`  ${p.manufacturer.name} | ${p.catalogNumber} | ${p.displayName ?? '(no name)'} | family: ${p.familyName ?? '(none)'}`)
    }
  }

  console.log('\nDone.')
}

classifyProducts().catch(console.error).finally(() => prisma.$disconnect())
