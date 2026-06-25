// ============================================================
// app/layout.tsx
// The outer "shell" of the app — wraps every page.
// Sets up fonts, global styles, and the sidebar navigation.
// ============================================================

import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'VanStock — Stock Control System',
  description: 'Service van stock management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen bg-gray-50 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
