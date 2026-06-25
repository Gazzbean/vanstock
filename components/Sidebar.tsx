// ============================================================
// components/Sidebar.tsx
// The left-hand navigation bar shown on every page.
// 'use client' means this runs in the browser (it needs to
// know the current URL to highlight the active link).
// ============================================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/lib/actions'

const navItems = [
  { href: '/dashboard', label: 'Dashboard',     icon: '⊞' },
  { href: '/stock',     label: 'My Van Stock',  icon: '📦' },
  { href: '/transfer',  label: 'Transfer Stock', icon: '⇄'  },
  { href: '/logs',      label: 'Activity Log',  icon: '☰'  },
  { href: '/admin',     label: 'Admin',         icon: '⚙'  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-48 min-w-[192px] bg-white border-r border-gray-200 flex flex-col">

      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="text-sm font-medium text-gray-900">🚐 VanStock</div>
        <div className="text-xs text-gray-400 mt-0.5">Stock Control System</div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent',
              ].join(' ')}
            >
              <span className="text-base" aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User info + sign out */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
            JM
          </div>
          <div>
            <div className="text-xs font-medium text-gray-800">James Miller</div>
            <div className="text-xs text-gray-400">Technician</div>
          </div>
        </div>
        <form action={signOut}>
          <button type="submit" className="btn btn-sm w-full justify-center text-gray-500">
            Sign out
          </button>
        </form>
      </div>

    </aside>
  )
}
