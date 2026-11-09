// ============================================================
// app/layout.tsx
// The outer "shell" of the app — wraps every page.
// Sets up fonts, global styles, and the sidebar navigation.
// ============================================================

import type { Metadata,Viewport } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import AutoRefresh from '@/components/AutoRefresh'

export const metadata: Metadata = {
  title: 'VanStock — Stock Control System',
  description: 'Service van stock management',
}

export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-[100dvh] bg-gray-50 overflow-hidden">
          <Sidebar />
          <AutoRefresh />
          <main className="flex-1 min-w-0 overflow-y-auto pt-14 pb-20 md:pt-0 md:pb-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
