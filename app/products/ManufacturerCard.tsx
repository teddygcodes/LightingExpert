'use client'

interface ManufacturerEntry {
  id: string
  name: string
  slug: string
  productCount: number
  categories: { id: string; name: string; slug: string }[]
}

export type { ManufacturerEntry }

export default function ManufacturerCard({ mfr, onClick }: { mfr: ManufacturerEntry; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--border)] hover:border-[var(--accent)] hover:border-l-[var(--accent)] px-5 py-[18px] cursor-pointer transition-[border-color,box-shadow] duration-[120ms] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(209,52,56,0.10)]"
    >
      <div className="font-bold text-[15px] text-[var(--text)] mb-1.5">{mfr.name}</div>
      <div className="text-xs text-[var(--text-secondary)] mb-2">
        {mfr.productCount > 0
          ? `${mfr.productCount} fixture${mfr.productCount !== 1 ? 's' : ''}`
          : 'No fixtures yet'}
      </div>
      <div className="text-[11px] text-[var(--text-faint)]">
        {mfr.categories.slice(0, 4).map((c) => c.name).join(' · ')}
        {mfr.categories.length > 4 ? ` · +${mfr.categories.length - 4} more` : ''}
      </div>
    </div>
  )
}
