'use client'

import { useState, useEffect, useCallback } from 'react'
import ProductCard from '@/components/ProductCard'
import { SkeletonCard } from '@/components/Skeleton'
import { getThumbnailUrl } from '@/lib/thumbnails'
import { COLORS } from '@/lib/design-tokens'
import Breadcrumb from './Breadcrumb'
import EmptyState from './EmptyState'
import ManufacturerCard, { type ManufacturerEntry } from './ManufacturerCard'
import CategoryCard, { type Category } from './CategoryCard'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Skeleton grid ────────────────────────────────────────────────────────────

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div style={gridStyle}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 10,
}

// ─── ProductBrowser ───────────────────────────────────────────────────────────

export default function ProductBrowser() {
  const [manufacturers, setManufacturers] = useState<ManufacturerEntry[]>([])
  const [selectedMfr, setSelectedMfr] = useState<ManufacturerEntry | null>(null)

  // Category drill-down stack
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [categoryStack, setCategoryStack] = useState<Category[]>([])
  const currentCategories: Category[] = categoryStack.length === 0
    ? allCategories
    : categoryStack[categoryStack.length - 1].children

  // Product display
  const [products, setProducts] = useState<Product[]>([])
  const [loadingMfrs, setLoadingMfrs] = useState(true)
  const [loadingCats, setLoadingCats] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(false)

  // Search
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [localSearch, setLocalSearch] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)

  type View = 'manufacturers' | 'categories' | 'products' | 'search'
  const [view, setView] = useState<View>('manufacturers')

  // ── Data fetching ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/manufacturers')
      .then((r) => r.json())
      .then((data) => { setManufacturers(data); setFetchError(null); setLoadingMfrs(false) })
      .catch(() => { setManufacturers([]); setFetchError('Failed to load manufacturers'); setLoadingMfrs(false) })
  }, [])

  const fetchCategories = useCallback(async (manufacturerId: string) => {
    setLoadingCats(true)
    try {
      const res = await fetch(`/api/categories?manufacturerId=${manufacturerId}`)
      const data = await res.json()
      setAllCategories(Array.isArray(data) ? data : [])
      setFetchError(null)
    } catch {
      setAllCategories([])
      setFetchError('Failed to load categories')
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
      setFetchError(null)
    } catch {
      setProducts([])
      setFetchError('Failed to load products')
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
        setFetchError(null)
      } catch {
        setSearchResults([])
        setFetchError('Failed to search products')
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
      setCategoryStack((prev) => [...prev, cat])
    } else {
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
    if (depth === undefined || depth < 0) {
      setCategoryStack([])
    } else {
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

  // ── Breadcrumb parts ──────────────────────────────────────────────────────

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
            onClick: i < categoryStack.length - 1 ? () => popToCategories(i) : undefined,
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
    <div>
      {/* Global search */}
      <div style={{ marginBottom: 24 }}>
        <input
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder="Search all products by catalog number…"
          style={{
            width: '100%',
            padding: '9px 13px',
            border: `1px solid ${COLORS.border}`,
            fontSize: 13,
            boxSizing: 'border-box',
            outline: 'none',
            background: COLORS.surface,
          }}
        />
      </div>

      {/* Fetch error banner */}
      {fetchError && (
        <div style={{ padding: '8px 12px', background: '#fff3f3', border: '1px solid #e88',
                      fontSize: 12, color: '#c00', marginBottom: 12 }}>
          {fetchError}
        </div>
      )}

      {/* Search results */}
      {view === 'search' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => { setGlobalSearch(''); setView('manufacturers') }}
              style={{ background: 'none', border: 'none', color: COLORS.accent, cursor: 'pointer', fontSize: 13, padding: 0 }}
            >
              ← Browse by manufacturer
            </button>
          </div>

          {loadingProducts && <SkeletonGrid count={12} />}

          {!loadingProducts && searchResults.length === 0 && (
            <EmptyState title="No results" description={`No products matching "${globalSearch}"`} />
          )}

          {!loadingProducts && searchResults.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
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

      {/* Manufacturer list */}
      {view === 'manufacturers' && (
        <div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>
            Select a manufacturer to browse fixtures.
          </div>
          {loadingMfrs ? (
            <SkeletonGrid count={6} />
          ) : manufacturers.length === 0 ? (
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

      {/* Category drill-down */}
      {view === 'categories' && selectedMfr && (
        <div>
          <Breadcrumb parts={breadcrumbCategoryParts.slice(0, -1).concat(
            breadcrumbCategoryParts.slice(-1).map(p => ({ ...p, onClick: undefined }))
          )} />

          {loadingCats && <SkeletonGrid count={8} />}

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

      {/* Product grid */}
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
                border: `1px solid ${COLORS.border}`,
                fontSize: 13,
                width: 260,
                outline: 'none',
              }}
            />
          </div>

          {loadingProducts && <SkeletonGrid count={12} />}

          {!loadingProducts && visibleProducts.length === 0 && (
            <EmptyState
              title="No fixtures found"
              description={localSearch ? `No results for "${localSearch}"` : 'No fixtures in this category yet. Run a crawl to populate.'}
            />
          )}

          {!loadingProducts && visibleProducts.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
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
