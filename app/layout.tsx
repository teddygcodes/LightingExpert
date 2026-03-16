import type { Metadata } from 'next'
import './globals.css'
import Topbar from '@/components/Topbar'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Atlantis KB — Lighting Expert',
  description: 'Lighting fixture catalog, cross-reference, and submittal generator',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Topbar />
        <Sidebar />
        <main
          style={{
            marginTop: 44,
            marginLeft: 260,
            minHeight: 'calc(100vh - 44px)',
            padding: 24,
          }}
        >
          {children}
        </main>
      </body>
    </html>
  )
}
