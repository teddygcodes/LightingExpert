export default function Topbar() {
  return (
    <header
      role="banner"
      aria-label="Atlantis KB"
      className="bg-[var(--accent)] text-white h-12 flex items-center px-4 fixed top-0 left-0 right-0 z-[100] border-b-2 border-b-[rgba(0,0,0,0.15)]"
    >
      {/* Logomark — stylized downlight */}
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="mr-2.5 shrink-0" aria-hidden="true">
        <rect x="5" y="2" width="12" height="6" stroke="white" strokeWidth="1.5" fill="none" />
        <line x1="7" y1="8" x2="4" y2="18" stroke="white" strokeWidth="1.2" opacity="0.5" />
        <line x1="15" y1="8" x2="18" y2="18" stroke="white" strokeWidth="1.2" opacity="0.5" />
        <line x1="11" y1="8" x2="11" y2="19" stroke="white" strokeWidth="1.2" opacity="0.7" />
        <circle cx="11" cy="5" r="1.5" fill="white" opacity="0.9" />
      </svg>

      <span className="font-semibold text-[15px] uppercase tracking-[0.12em]">Atlantis KB</span>
      <span className="text-white/40 mx-2.5 font-light select-none">|</span>
      <span className="text-white/85 text-sm font-normal">Lighting Expert</span>
    </header>
  )
}
