'use client'

export default function Breadcrumb({ parts }: { parts: { label: string; onClick?: () => void }[] }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] mb-5">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[var(--text-faint)]">›</span>}
          {p.onClick ? (
            <button
              onClick={p.onClick}
              className="bg-transparent border-none p-0 cursor-pointer text-[var(--accent)] text-[13px] no-underline"
            >
              {p.label}
            </button>
          ) : (
            <span className="text-[var(--text)] font-semibold">{p.label}</span>
          )}
        </span>
      ))}
    </div>
  )
}
