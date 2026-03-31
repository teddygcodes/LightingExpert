'use client'

export default function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      className="flex flex-col items-center px-6 py-14 text-[var(--text-secondary)] border border-dashed border-[var(--border-strong)]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40' fill='none' stroke='%23e2e1de' stroke-width='0.5' opacity='0.5'/%3E%3C/svg%3E")`,
        backgroundSize: '40px 40px',
      }}
    >
      <svg width={40} height={40} viewBox="0 0 40 40" fill="none" className="mb-4 opacity-35">
        <rect x={4} y={10} width={32} height={24} stroke="var(--text-secondary)" strokeWidth={2} />
        <path d="M4 17h32" stroke="var(--text-secondary)" strokeWidth={2} />
        <path d="M13 10V6a7 7 0 0 1 14 0v4" stroke="var(--text-secondary)" strokeWidth={2} />
      </svg>
      <div className="font-semibold text-[15px] text-[var(--text)] mb-1.5">{title}</div>
      <div className="text-[13px] text-center max-w-[300px]">{description}</div>
    </div>
  )
}
