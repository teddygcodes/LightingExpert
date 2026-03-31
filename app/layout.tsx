import type { Metadata } from 'next'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Topbar from '@/components/Topbar'
import Sidebar from '@/components/Sidebar'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

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
    <html lang="en" className={`${dmSans.variable} ${jetBrainsMono.variable}`}>
      <body>
        <a href="#main-content" className="skip-nav">
          Skip to main content
        </a>
        <Topbar />
        <Sidebar />
        <main
          id="main-content"
          role="main"
          style={{
            marginTop: 48,
            marginLeft: 260,
            minHeight: 'calc(100vh - 48px)',
            padding: 24,
          }}
        >
          {children}
        </main>
      </body>
    </html>
  )
}
