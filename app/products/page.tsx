import ProductBrowser from './ProductBrowser'

export default function ProductsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Products</h1>
      <p style={{ color: '#6b6b6b', fontSize: 13, marginBottom: 20 }}>
        Lighting fixtures crawled from Elite Lighting — browse, search, and edit specs.
      </p>
      <ProductBrowser />
    </div>
  )
}
