import { PrismaClient } from '../node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()
const cfg = {
  LUMENS: ['600L', '1200L', '2400L'],
  DRIVER: ['DIM10'],
  VOLTAGE: ['MVOLT'],
  CCT: ['27K', '30K', '35K', '40K', '50K'],
  OPTICS: ['MD', 'WD'],
  CRI: ['90+', '98+'],
  'TRIM TYPE': ['MOS-6601', 'MOS-6607', 'MOS-6614'],
}

try {
  const p = await prisma.product.update({
    where: { id: 'cmmpt081i000ze9xdueq26zlp' },
    data: { configOptions: cfg },
    select: { catalogNumber: true, configOptions: true },
  })
  console.log('OK:', p.catalogNumber, 'keys:', Object.keys(p.configOptions))
} catch (e) {
  console.error('FAIL:', e.message)
} finally {
  await prisma.$disconnect()
}
