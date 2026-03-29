export default function Topbar() {
  return (
    <header
      role="banner"
      aria-label="Atlantis KB"
      style={{
        background: '#d13438',
        color: '#fff',
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 15 }}>Atlantis KB</span>
      <span style={{ color: 'rgba(255,255,255,0.5)', margin: '0 10px', fontWeight: 300 }}>|</span>
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 400 }}>Lighting Expert</span>
    </header>
  )
}
