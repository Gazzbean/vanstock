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
import { useState } from 'react'
import { markWarehouseNotificationRead, signOut } from '@/lib/actions'

const navItems = [
  { href: '/dashboard', label: 'Dashboard',      icon: '⊞' },
  { href: '/stock',     label: 'My Van Stock',   icon: '📦' },
  { href: '/fleet',     label: 'Fleet Stock',    icon: '🚐' },
  { href: '/receive',   label: 'Receive Stock',   icon: '↓'  },
  { href: '/transfer',  label: 'Materials Used',  icon: '⇄'  },
  { href: '/logs',      label: 'Transaction History',   icon: '☰'  },
  { href: '/warehouse', label: 'Warehouse', icon: '▣' },
  { href: '/admin',     label: 'Admin',          icon: '⚙'  },
]

interface UserDisplay {
  full_name: string
  role: string
  access?: {office_access:boolean;technician_access:boolean;receive_stock:boolean;manage_catalogue:boolean;manage_users:boolean}
  van_number: string | null
}

type WarehouseNotification = {
  id:string;event_type:string;reference:string;status:string;created_at:string;read_at:string|null
}

export default function SidebarNav({ user, notifications=[] }: {
  user: UserDisplay | null; notifications?:WarehouseNotification[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [inboxOpen,setInboxOpen]=useState(false)
  const unread=notifications.filter(n=>!n.read_at).length
  // Invite acceptance is a standalone auth flow, not an authenticated app screen.
  if (pathname.startsWith('/auth/accept-invite')) return null

  const roleLabel = user?.access
    ? [user.access.manage_users ? 'Administrator' : user.access.office_access ? 'Office' : '',
       user.access.technician_access ? 'Technician' : ''].filter(Boolean).join(' + ') || 'User'
    : user?.role ?? '—'

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
        {user?.access?.office_access && <div className="mt-3">
          <button type="button" className="btn btn-sm w-full justify-between" onClick={()=>setInboxOpen(v=>!v)}
            aria-expanded={inboxOpen} aria-label={`Warehouse notifications, ${unread} unread`}>
            <span>🔔 Notifications</span>
            {unread>0&&<span className="rounded-full bg-red-600 px-2 text-xs text-white">{unread}</span>}
          </button>
          {inboxOpen&&<div className="mt-2 max-h-64 overflow-y-auto rounded border border-gray-200 bg-white p-2">
            {notifications.length===0?<p className="text-xs text-gray-500">No notifications.</p>:
              notifications.slice(0,12).map(n=><div key={n.id} className={`border-b border-gray-100 py-2 text-xs ${n.read_at?'text-gray-500':'font-semibold text-gray-900'}`}>
                <p>{n.reference} — {n.event_type}</p>
                <div className="mt-1 flex gap-2">
                  <Link href="/warehouse" className="text-blue-700" onClick={()=>setInboxOpen(false)}>View request</Link>
                  {!n.read_at&&<button type="button" className="text-blue-700 underline" onClick={async()=>{
                    const result=await markWarehouseNotificationRead(n.id)
                    if(result.success)router.refresh()
                  }}>Mark read</button>}
                </div>
              </div>)}
          </div>}
        </div>}
      </div>

      {/* Navigation links */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          if (item.href === '/receive' && !user?.access?.receive_stock) return null
          if (item.href === '/admin' && user?.role !== 'manager' && user?.role !== 'admin') return null
          if (item.href === '/warehouse' && !user?.access?.office_access) return null
          if (item.href === '/fleet' && !user?.access?.office_access && user?.role !== 'admin') return null
          if ((item.href === '/stock' || item.href === '/transfer') && !user?.access?.technician_access) return null
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
              {roleLabel}{user?.access?.technician_access && user?.van_number ? ` · ${user.van_number}` : ''}
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
