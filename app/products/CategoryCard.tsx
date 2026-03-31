'use client'

export interface Category {
  id: string
  name: string
  slug: string
  path: string | null
  sortOrder: number
  parentId: string | null
  children: Category[]
  directProductCount: number
  childCategoryCount: number
  descendantProductCount: number
}

export default function CategoryCard({
  cat,
  onClick,
  onViewAll,
}: {
  cat: Category
  onClick: () => void
  onViewAll: () => void
}) {
  const hasChildren = cat.childCategoryCount > 0

  return (
    <div
      onClick={onClick}
      className="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--border)] hover:border-[var(--accent)] hover:border-l-[var(--accent)] px-[18px] py-4 cursor-pointer transition-[border-color,box-shadow] duration-[120ms] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(209,52,56,0.10)]"
    >
      <div className="flex justify-between items-start">
        <span className="font-semibold text-sm text-[var(--text)]">{cat.name}</span>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-[11px] bg-[var(--accent-dim)] text-[var(--accent)] px-2 py-0.5 font-semibold">
            {hasChildren ? `${cat.childCategoryCount} sub` : cat.directProductCount}
          </span>
          {hasChildren && <span className="text-[var(--text-faint)] text-sm">›</span>}
        </div>
      </div>

      {cat.descendantProductCount > 0 && (
        <div className="text-[11px] text-[var(--text-faint)] mt-2">
          {cat.descendantProductCount} total fixture{cat.descendantProductCount !== 1 ? 's' : ''} in branch
        </div>
      )}

      {hasChildren && cat.descendantProductCount > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onViewAll() }}
          className="mt-2.5 bg-transparent border-none p-0 cursor-pointer text-[var(--accent)] text-[11px] underline"
        >
          View all {cat.descendantProductCount} fixtures →
        </button>
      )}
    </div>
  )
}
