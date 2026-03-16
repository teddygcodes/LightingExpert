import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = path.join(process.cwd(), '..', 'atlantiskb-lighting')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function saveSpecSheet(
  manufacturer: string,
  catalogNumber: string,
  buffer: Buffer
): string {
  const safeManufacturer = manufacturer.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
  const safeCatalog = catalogNumber.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
  const dir = path.join(process.cwd(), 'public', 'spec-sheets', safeManufacturer)
  ensureDir(dir)
  const filePath = path.join(dir, `${safeCatalog}.pdf`)
  fs.writeFileSync(filePath, buffer)
  return `/spec-sheets/${safeManufacturer}/${safeCatalog}.pdf`
}

export function getSpecSheetPath(manufacturer: string, catalogNumber: string): string | null {
  const safeManufacturer = manufacturer.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
  const safeCatalog = catalogNumber.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
  const filePath = path.join(process.cwd(), 'public', 'spec-sheets', safeManufacturer, `${safeCatalog}.pdf`)
  return fs.existsSync(filePath) ? `/spec-sheets/${safeManufacturer}/${safeCatalog}.pdf` : null
}

export function saveSubmittal(submittalId: string, buffer: Buffer): string {
  const dir = path.join(process.cwd(), 'public', 'submittals')
  ensureDir(dir)
  const filePath = path.join(dir, `${submittalId}.pdf`)
  fs.writeFileSync(filePath, buffer)
  return `/submittals/${submittalId}.pdf`
}
