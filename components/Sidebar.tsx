'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Chat', exact: true },
  { href: '/products', label: 'Products', exact: false },
  { href: '/cross-reference', label: 'Cross Reference', exact: false },
  { href: '/submittals', label: 'Submittals', exact: false },
  { href: '/admin', label: 'Admin / Crawl Log', exact: false },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        width: 220,
        background: '#fff',
        borderRight: '1px solid #e0e0e0',
        position: 'fixed',
        top: 44,
        left: 0,
        bottom: 0,
        overflowY: 'auto',
        zIndex: 90,
      }}
    >
      <div style={{ padding: '8px 0' }}>
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                color: active ? '#d13438' : '#1a1a1a',
                background: active ? '#fff5f5' : 'transparent',
                borderLeft: active ? '3px solid #d13438' : '3px solid transparent',
                fontWeight: active ? 600 : 400,
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
