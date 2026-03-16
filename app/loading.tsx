export default function Loading() {
  return (
    <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, color: '#6b6b6b', fontSize: 13 }}>
      <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #d13438', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
