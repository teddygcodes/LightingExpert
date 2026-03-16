'use client'

import { useState, useEffect, useCallback } from 'react'
import ProductCard from '@/components/ProductCard'
import { getThumbnailUrl } from '@/lib/thumbnails'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManufacturerEntry {
  id: string
  name: string
  slug: string
  productCount: number
  categories: { id: string; name: string; slug: string }[]
}

interface Category {
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

interface Product {
  id: string
  catalogNumber: string
  familyName: string | null
  displayName: string | null
  overallConfidence: number | null
  wattage: number | null
  lumens: number | null
  cri: number | null
  specSheetUrl: string | null
  manufacturer?: { name: string; slug: string }
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const ACCENT = '#d13438'
const BG = '#f3f2f1'
const CARD_BG = '#ffffff'
const BORDER = '#edebe9'
const TEXT_PRIMARY = '#201f1e'
const TEXT_SECONDARY = '#605e5c'
const TEXT_MUTED = '#a19f9d'
const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif'

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ parts }: { parts: { label: string; onClick?: () => void }[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: TEXT_SECONDARY, marginBottom: 20, fontFamily: FONT }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: TEXT_MUTED }}>›</span>}
          {p.onClick ? (
            <button
              onClick={p.onClick}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: ACCENT,
                fontSize: 13,
                fontFamily: FONT,
                textDecoration: 'none',
              }}
            >
              {p.label}
            </button>
          ) : (
            <span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>{p.label}</span>
          )}
        </span>
      ))}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '56px 24px',
      color: TEXT_SECONDARY,
      fontFamily: FONT,
    }}>
      <svg width={40} height={40} viewBox="0 0 40 40" fill="none" style={{ marginBottom: 16, opacity: 0.35 }}>
        <rect x={4} y={10} width={32} height={24} rx={3} stroke={TEXT_SECONDARY} strokeWidth={2} />
        <path d="M4 17h32" stroke={TEXT_SECONDARY} strokeWidth={2} />
        <path d="M13 10V6a7 7 0 0 1 14 0v4" stroke={TEXT_SECONDARY} strokeWidth={2} />
      </svg>
      <div style={{ fontWeight: 600, fontSize: 15, color: TEXT_PRIMARY, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 300 }}>{description}</div>
    </div>
  )
}

// ─── Manufacturer card ────────────────────────────────────────────────────────

function ManufacturerCard({ mfr, onClick }: { mfr: ManufacturerEntry; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: CARD_BG,
        border: `1px solid ${hovered ? ACCENT : BORDER}`,
        borderLeft: `3px solid ${hovered ? ACCENT : BORDER}`,
        borderRadius: 4,
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.12s, box-shadow 0.12s',
        boxShadow: hovered ? '0 2px 8px rgba(209,52,56,0.10)' : '0 1px 2px rgba(0,0,0,0.04)',
        fontFamily: FONT,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, color: TEXT_PRIMARY, marginBottom: 6 }}>{mfr.name}</div>
      <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 8 }}>
        {mfr.productCount > 0
          ? `${mfr.productCount} fixture${mfr.productCount !== 1 ? 's' : ''}`
          : 'No fixtures yet'}
      </div>
      <div style={{ fontSize: 11, color: TEXT_MUTED }}>
        {mfr.categories.slice(0, 4).map((c) => c.name).join(' · ')}
        {mfr.categories.length > 4 ? ` · +${mfr.categories.length - 4} more` : ''}
      </div>
    </div>
  )
}

// ─── Category card ────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  onClick,
  onViewAll,
}: {
  cat: Category
  onClick: () => void
  onViewAll: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const hasChildren = cat.childCategoryCount > 0

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: CARD_BG,
        border: `1px solid ${hovered ? ACCENT : BORDER}`,
        borderLeft: `3px solid ${hovered ? ACCENT : BORDER}`,
        borderRadius: 4,
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'border-color 0.12s, box-shadow 0.12s',
        boxShadow: hovered ? '0 2px 8px rgba(209,52,56,0.10)' : '0 1px 2px rgba(0,0,0,0.04)',
        fontFamily: FONT,
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: TEXT_PRIMARY }}>{cat.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
          {/* Red pill badge */}
          <span style={{
            fontSize: 11,
            background: '#fde7e9',
            color: ACCENT,
            padding: '2px 8px',
            borderRadius: 10,
            fontWeight: 600,
          }}>
            {hasChildren ? `${cat.childCategoryCount} sub` : cat.directProductCount}
          </span>
          {hasChildren && <span style={{ color: TEXT_MUTED, fontSize: 14 }}>›</span>}
        </div>
      </div>

      {cat.descendantProductCount > 0 && (
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 8 }}>
          {cat.descendantProductCount} total fixture{cat.descendantProductCount !== 1 ? 's' : ''} in branch
        </div>
      )}

      {/* "View all" secondary action — only shown for nodes that have descendants */}
      {hasChildren && cat.descendantProductCount > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onViewAll() }}
          style={{
            marginTop: 10,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: ACCENT,
            fontSize: 11,
            fontFamily: FONT,
            textDecoration: 'underline',
          }}
        >
          View all {cat.descendantProductCount} fixtures →
        </button>
      )}
    </div>
  )
}

// ─── ProductBrowser ───────────────────────────────────────────────────────────

export default function ProductBrowser() {
  const [manufacturers, setManufacturers] = useState<ManufacturerEntry[]>([])
  const [selectedMfr, setSelectedMfr] = useState<ManufacturerEntry | null>(null)

  // Category drill-down stack
  const [allCategories, setAllCategories] = useState<Category[]>([]) // root list
  const [categoryStack, setCategoryStack] = useState<Category[]>([]) // breadcrumb trail
  const currentCategories: Category[] = categoryStack.length === 0
    ? allCategories
    : categoryStack[categoryStack.length - 1].children

  // Product display
  const [products, setProducts] = useState<Product[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(false)

  // Search
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [localSearch, setLocalSearch] = useState('')

  type View = 'manufacturers' | 'categories' | 'products' | 'search'
  const [view, setView] = useState<View>('manufacturers')

  // ── Data fetching ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/manufacturers')
      .then((r) => r.json())
      .then(setManufacturers)
      .catch(() => setManufacturers([]))
  }, [])

  const fetchCategories = useCallback(async (manufacturerId: string) => {
    setLoadingCats(true)
    try {
      const res = await fetch(`/api/categories?manufacturerId=${manufacturerId}`)
      const data = await res.json()
      setAllCategories(Array.isArray(data) ? data : [])
    } catch {
      setAllCategories([])
    } finally {
      setLoadingCats(false)
    }
  }, [])

  const fetchProducts = useCallback(async (categoryId?: string, mfrId?: string) => {
    setLoadingProducts(true)
    setProducts([])
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (categoryId) params.set('categoryId', categoryId)
      if (mfrId) params.set('manufacturerId', mfrId)
      const res = await fetch(`/api/products?${params}`)
      const data = await res.json()
      setProducts(data.data ?? [])
    } catch {
      setProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }, [])

  // Debounced global search
  useEffect(() => {
    if (!globalSearch.trim()) {
      if (view === 'search') setView('manufacturers')
      setSearchResults([])
      return
    }
    setView('search')
    const t = setTimeout(async () => {
      setLoadingProducts(true)
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(globalSearch)}&limit=100`)
        const data = await res.json()
        setSearchResults(data.data ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setLoadingProducts(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [globalSearch])

  // ── Navigation ────────────────────────────────────────────────────────────

  function selectManufacturer(m: ManufacturerEntry) {
    setSelectedMfr(m)
    setCategoryStack([])
    setLocalSearch('')
    setProducts([])
    fetchCategories(m.id)
    setView('categories')
  }

  function selectCategory(cat: Category) {
    if (cat.childCategoryCount > 0) {
      // Drill into sub-categories
      setCategoryStack((prev) => [...prev, cat])
    } else {
      // Leaf — push to stack so it shows in breadcrumb, then load products
      setCategoryStack((prev) => [...prev, cat])
      setLocalSearch('')
      fetchProducts(cat.id, selectedMfr!.id)
      setView('products')
    }
  }

  function viewAllInBranch(cat: Category) {
    setCategoryStack((prev) => [...prev, cat])
    setLocalSearch('')
    fetchProducts(cat.id, selectedMfr!.id)
    setView('products')
  }

  function popToManufacturers() {
    setView('manufacturers')
    setSelectedMfr(null)
    setCategoryStack([])
    setAllCategories([])
    setProducts([])
    setLocalSearch('')
  }

  function popToCategories(depth?: number) {
    // depth = undefined → pop to root; depth = n → show children of stack[n]
    if (depth === undefined || depth < 0) {
      setCategoryStack([])
    } else {
      // Keep items 0..depth inclusive so the category at depth is the current level
      setCategoryStack((prev) => prev.slice(0, depth + 1))
    }
    setProducts([])
    setLocalSearch('')
    setView('categories')
  }

  // ── Local product filter ──────────────────────────────────────────────────

  const visibleProducts = localSearch
    ? products.filter(
        (p) =>
          p.catalogNumber.toLowerCase().includes(localSearch.toLowerCase()) ||
          (p.displayName ?? '').toLowerCase().includes(localSearch.toLowerCase()) ||
          (p.familyName ?? '').toLowerCase().includes(localSearch.toLowerCase())
      )
    : products

  // ── Breadcrumb parts for categories/products view ─────────────────────────

  const breadcrumbCategoryParts = [
    { label: 'Products', onClick: popToManufacturers },
    { label: selectedMfr?.name ?? '', onClick: () => popToCategories() },
    ...categoryStack.map((cat, i) => ({
      label: cat.name,
      onClick: i < categoryStack.length - 1 ? () => popToCategories(i) : undefined,
    })),
  ]

  const breadcrumbProductParts =
    view === 'products' && categoryStack.length > 0
      ? [
          { label: 'Products', onClick: popToManufacturers },
          { label: selectedMfr?.name ?? '', onClick: () => popToCategories() },
          ...categoryStack.map((cat, i) => ({
            label: cat.name,
            // Last item is the leaf — not clickable
            onClick: i < categoryStack.length - 1
              ? () => popToCategories(i)
              : undefined,
          })),
        ]
      : view === 'products'
      ? [
          { label: 'Products', onClick: popToManufacturers },
          { label: selectedMfr?.name ?? '' },
        ]
      : []

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Global search */}
      <div style={{ marginBottom: 24 }}>
        <input
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder="Search all products by catalog number…"
          style={{
            width: '100%',
            padding: '9px 13px',
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            fontSize: 13,
            fontFamily: FONT,
            boxSizing: 'border-box',
            outline: 'none',
            background: CARD_BG,
          }}
        />
      </div>

      {/* ── Search results ── */}
      {view === 'search' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => { setGlobalSearch(''); setView('manufacturers') }}
              style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: FONT }}
            >
              ← Browse by manufacturer
            </button>
          </div>

          {loadingProducts && <LoadingSpinner />}

          {!loadingProducts && searchResults.length === 0 && (
            <EmptyState title="No results" description={`No products matching "${globalSearch}"`} />
          )}

          {!loadingProducts && searchResults.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 12 }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{globalSearch}&rdquo;
              </div>
              <div style={gridStyle}>
                {searchResults.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    thumbnailUrl={p.manufacturer ? getThumbnailUrl(p.manufacturer.slug, p.catalogNumber) : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Manufacturer list ── */}
      {view === 'manufacturers' && (
        <div>
          <div style={{ fontSize: 13, color: TEXT_SECONDARY, marginBottom: 16 }}>
            Select a manufacturer to browse fixtures.
          </div>
          {manufacturers.length === 0 ? (
            <EmptyState title="No manufacturers" description="Run a crawl to import fixtures." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {manufacturers.map((m) => (
                <ManufacturerCard key={m.id} mfr={m} onClick={() => selectManufacturer(m)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Category drill-down ── */}
      {view === 'categories' && selectedMfr && (
        <div>
          <Breadcrumb parts={breadcrumbCategoryParts.slice(0, -1).concat(
            breadcrumbCategoryParts.slice(-1).map(p => ({ ...p, onClick: undefined }))
          )} />

          {loadingCats && <LoadingSpinner />}

          {!loadingCats && currentCategories.length === 0 && (
            <EmptyState
              title="No categories yet"
              description="Run a crawl to populate categories for this manufacturer."
            />
          )}

          {!loadingCats && currentCategories.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {currentCategories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  cat={cat}
                  onClick={() => selectCategory(cat)}
                  onViewAll={() => viewAllInBranch(cat)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Product grid ── */}
      {view === 'products' && selectedMfr && (
        <div>
          <Breadcrumb parts={breadcrumbProductParts} />

          <div style={{ marginBottom: 16 }}>
            <input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Filter fixtures…"
              style={{
                padding: '7px 12px',
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
                fontSize: 13,
                fontFamily: FONT,
                width: 260,
                outline: 'none',
              }}
            />
          </div>

          {loadingProducts && <LoadingSpinner />}

          {!loadingProducts && visibleProducts.length === 0 && (
            <EmptyState
              title="No fixtures found"
              description={localSearch ? `No results for "${localSearch}"` : 'No fixtures in this category yet. Run a crawl to populate.'}
            />
          )}

          {!loadingProducts && visibleProducts.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 12 }}>
                {visibleProducts.length} fixture{visibleProducts.length !== 1 ? 's' : ''}
              </div>
              <div style={gridStyle}>
                {visibleProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    thumbnailUrl={getThumbnailUrl(selectedMfr.slug, p.catalogNumber)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div style={{ color: TEXT_SECONDARY, fontSize: 13, padding: '32px 0', textAlign: 'center', fontFamily: FONT }}>
      Loading…
    </div>
  )
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 10,
}
