import CrossReferenceClient from './CrossReferenceClient'

export default function CrossReferencePage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Cross Reference</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        Enter an Elite Lighting catalog number to find equivalent fixtures ranked by confidence.
      </p>
      <CrossReferenceClient />
    </div>
  )
}
