import path from 'path'

// Same sanitization rules as lib/storage.ts
function sanitize(s: string): string {
  return s.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
}

// Absolute filesystem path to the thumbnail PNG
export function getThumbnailPath(manufacturerSlug: string, catalogNumber: string): string {
  return path.join(
    process.cwd(),
    'public',
    'thumbnails',
    sanitize(manufacturerSlug),
    `${sanitize(catalogNumber)}.png`
  )
}

// Public URL for use in <img src=...>
export function getThumbnailUrl(manufacturerSlug: string, catalogNumber: string): string {
  return `/thumbnails/${sanitize(manufacturerSlug)}/${sanitize(catalogNumber)}.png`
}
