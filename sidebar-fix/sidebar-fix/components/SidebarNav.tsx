// ============================================================
// components/SidebarNav.tsx   (NEW FILE)
//
// The interactive part of the sidebar — highlights the active
// page link and handles the sign-out button click.
// Receives the REAL logged-in user's details as a prop from
// the Sidebar server component, instead of hardcoded text.
// ============================================================

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '@/lib/actions'

const navItems = [
  { href: '/dashboard', label: 'Dashboard',      icon: '⊞' },
  { href: '/stock',     label: 'My Van Stock',   icon: '📦' },
  { href: '/transfer',  label: 'Transfer Stock',  icon: '⇄'  },
  { href: '/logs',      label: 'Activity Log',   icon: '☰'  },
  { href: '/admin',     label: 'Admin',          icon: '⚙'  },
]

interface UserDisplay {
  full_name: string
  role: string
  van_number: string | null
}

export default function SidebarNav({ user }: { user: UserDisplay | null }) {
  const pathname = usePathname()
  const router = useRouter()

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

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

      {/* Real logged-in user info + sign out */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-gray-800 truncate">
              {user?.full_name ?? 'Unknown user'}
            </div>
            <div className="text-xs text-gray-400 capitalize truncate">
              {user?.role ?? '—'}{user?.van_number ? ` · ${user.van_number}` : ''}
            </div>
          </div>
        </div>
        <button onClick={handleSignOut} className="btn btn-sm w-full justify-center text-gray-500">
          Sign out
        </button>
      </div>

    </aside>
  )
}
