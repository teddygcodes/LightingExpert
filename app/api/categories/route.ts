import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string
  parentId: string | null
  name: string
  slug: string
  path: string | null
  sortOrder: number
  sourceUrl: string | null
  externalKey: string | null
  _count: { products: number; children: number }
}

interface CategoryNode extends Omit<CategoryRow, '_count'> {
  directProductCount: number
  childCategoryCount: number
  descendantProductCount: number
  children: CategoryNode[]
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const manufacturerId = req.nextUrl.searchParams.get('manufacturerId')
  if (!manufacturerId) {
    return NextResponse.json({ error: 'manufacturerId is required' }, { status: 400 })
  }

  const rows: CategoryRow[] = await prisma.category.findMany({
    where: { manufacturerId },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true, children: true } } },
  })

  // Build a map for O(1) lookup
  const byId = new Map<string, CategoryNode>()
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      slug: r.slug,
      path: r.path,
      sortOrder: r.sortOrder,
      sourceUrl: r.sourceUrl,
      externalKey: r.externalKey,
      directProductCount: r._count.products,
      childCategoryCount: r._count.children,
      descendantProductCount: r._count.products, // start with direct; DFS will accumulate
      children: [],
    })
  }

  // Wire up parent→children
  const roots: CategoryNode[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // DFS to compute descendantProductCount bottom-up
  function computeDescendants(node: CategoryNode): number {
    let total = node.directProductCount
    for (const child of node.children) {
      total += computeDescendants(child)
    }
    node.descendantProductCount = total
    return total
  }
  for (const root of roots) {
    computeDescendants(root)
  }

  return NextResponse.json(roots)
}
