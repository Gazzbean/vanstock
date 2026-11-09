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
  { href: '/actions', label: 'My Actions', icon: '☑' },
  { href: '/stock',     label: 'My Van Stock',   icon: '📦' },
  { href: '/fleet',     label: 'Fleet Stock',    icon: '🚐' },
  { href: '/receive',   label: 'Receive Stock',   icon: '↓'  },
  { href: '/transfer',  label: 'Materials Used',  icon: '⇄'  },
  { href: '/van-transfers', label: 'Van Transfers', icon: '🚚' },
  { href: '/logs',      label: 'Transaction History',   icon: '☰'  },
  { href: '/warehouse', label: 'Warehouse', icon: '▣' },
  { href: '/admin',     label: 'Admin',          icon: '⚙'  },
  { href: '/help', label: 'Help & SOPs', icon: '?' },
]

const sectionName = (href:string) =>
  ['/dashboard','/actions','/stock'].includes(href)?'My Work':
  ['/logs','/help'].includes(href)?'Records & Help':
  href==='/admin'?'Administration':'Stock Operations'

interface UserDisplay {
  full_name: string
  role: string
  access?: {office_access:boolean;technician_access:boolean;receive_stock:boolean;manage_catalogue:boolean;manage_users:boolean}
  manager_operations?: {maintain_catalogue:boolean;maintain_vehicles:boolean}
  van_number: string | null
}

type WarehouseNotification = {
  id:string;request_id:string;event_type:string;reference:string;status:string;created_at:string;read_at:string|null
}

export default function SidebarNav({ user, notifications=[] }: {
  user: UserDisplay | null; notifications?:WarehouseNotification[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [inboxOpen,setInboxOpen]=useState(false)
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false)
  const unread=notifications.filter(n=>!n.read_at&&n.status!=='fulfilled').length
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

  const navAvailable = (href:string) => {
    if (href === '/receive' && !user?.access?.receive_stock) return false
    if (href === '/admin' && user?.role !== 'admin' && !user?.manager_operations?.maintain_catalogue && !user?.manager_operations?.maintain_vehicles) return false
    if (href === '/warehouse' && !user?.access?.office_access) return false
    if (href === '/fleet' && !user?.access?.office_access && user?.role !== 'admin') return false
    if ((href === '/stock' || href === '/transfer') && !user?.access?.technician_access) return false
    if (href === '/van-transfers' && !user?.access?.technician_access && !user?.access?.office_access) return false
    return true
  }
  const availableItems=navItems.filter(item=>navAvailable(item.href))
  const groups=['My Work','Stock Operations','Administration','Records & Help']
  const nav=<nav className="flex-1 overflow-y-auto py-2" aria-label="Main navigation">
    {groups.map(group => {
      const items=availableItems.filter(item=>sectionName(item.href)===group)
      return items.length?<div key={group} className="mb-3">
        <h2 className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group}</h2>
        {items.map(item=><Link key={item.href} href={item.href} onClick={()=>setMobileMenuOpen(false)}
          className={`flex items-center gap-2.5 px-4 py-3 min-h-11 text-sm ${pathname.startsWith(item.href)?'bg-blue-50 text-blue-700 font-semibold border-l-2 border-blue-600':'text-gray-600 hover:bg-gray-50 border-l-2 border-transparent'}`}>
          <span aria-hidden>{item.icon}</span>{item.label}
        </Link>)}
      </div>:null
    })}
  </nav>
  return (<>
    <aside className="hidden md:flex w-56 min-w-[224px] bg-white border-r border-gray-200 flex-col">

      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="text-sm font-medium text-gray-900">🚐 VanStock</div>
        <div className="text-xs text-gray-400 mt-0.5">Simplicity Air stock control</div>
        {(user?.access?.office_access||user?.access?.technician_access) && <div className="mt-3">
          <button type="button" className="btn btn-sm w-full justify-between" onClick={()=>setInboxOpen(v=>!v)}
            aria-expanded={inboxOpen} aria-label={`Warehouse notifications, ${unread} unread`}>
            <span>🔔 Notifications</span>
            {unread>0&&<span className="rounded-full bg-red-600 px-2 text-xs text-white">{unread}</span>}
          </button>
          {inboxOpen&&<div className="mt-2 max-h-64 overflow-y-auto rounded border border-gray-200 bg-white p-2">
            {notifications.length===0?<p className="text-xs text-gray-500">No notifications.</p>:
              notifications.slice(0,12).map(n=><div key={n.id} className={`border-b border-gray-100 py-2 text-xs ${n.read_at?'text-gray-500':'font-semibold text-gray-900'}`}>
                <p>{n.reference} — {n.event_type==='discrepancy'?'Receiving discrepancy — review required':n.status==='fulfilled'?'Completed':n.status==='issued'?'Awaiting van receipt':n.status==='approved'?'Approved':n.status==='rejected'?'Rejected':n.event_type}</p>
                <div className="mt-1 flex gap-2">
                  <Link href={`${user?.access?.office_access?'/warehouse':'/stock'}#warehouse-request-${n.request_id}`} className="text-blue-700" onClick={()=>setInboxOpen(false)}>View request</Link>
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
      {nav}

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
    <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b flex items-center justify-between px-4">
      <strong>🚐 VanStock</strong><div className="flex gap-2"><button type="button" onClick={()=>{setInboxOpen(true);setMobileMenuOpen(true)}} className="border rounded-lg min-h-11 min-w-11 relative" aria-label={`${unread} unread notifications`}>🔔{unread>0&&<span className="absolute -top-1 -right-1 rounded-full bg-red-600 text-white text-xs px-1">{unread}</span>}</button><button type="button" onClick={()=>setMobileMenuOpen(true)} className="border rounded-lg min-h-11 min-w-11" aria-label="Open menu">☰</button></div>
    </header>
    {mobileMenuOpen&&<div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={()=>setMobileMenuOpen(false)}>
      <div className="bg-white w-[min(88vw,340px)] h-full flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="p-3 border-b flex justify-between items-center"><strong>{roleLabel}</strong><button type="button" className="min-h-11 min-w-11" onClick={()=>setMobileMenuOpen(false)} aria-label="Close menu">✕</button></div>
        {inboxOpen&&<section className="p-3 border-b max-h-48 overflow-y-auto" aria-label="Notifications">
          <h2 className="font-semibold text-sm mb-2">Notifications</h2>
          {!notifications.length?<p className="text-xs text-gray-500">No notifications.</p>:notifications.slice(0,8).map(n=><div key={n.id} className="text-sm border-b py-2">
            <div>{n.reference} — {n.event_type==='discrepancy'?'Receiving discrepancy — review required':n.status==='fulfilled'?'Completed':n.status}</div>
            <Link href={`${user?.access?.office_access?'/warehouse':'/stock'}#warehouse-request-${n.request_id}`} className="text-blue-700 underline" onClick={()=>setMobileMenuOpen(false)}>View request</Link>
            {!n.read_at&&<button type="button" className="ml-3 text-blue-700 underline" onClick={async()=>{const result=await markWarehouseNotificationRead(n.id);if(result.success)router.refresh()}}>Mark read</button>}
          </div>)}
        </section>}
        {nav}<button type="button" className="min-h-11 border-t" onClick={handleSignOut}>Sign out</button>
      </div>
    </div>}
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-white flex justify-around pb-[env(safe-area-inset-bottom)]" aria-label="Mobile quick navigation">
      {[{href:'/dashboard',label:'Home',icon:'⌂'},{href:'/actions',label:'Actions',icon:'☑'},{href:user?.access?.technician_access?'/stock':'/warehouse',label:'Stock',icon:'📦'}].map(item=><Link key={item.href} href={item.href} className={`flex-1 flex flex-col min-h-14 justify-center items-center text-xs ${pathname.startsWith(item.href)?'text-blue-700 font-semibold':'text-gray-600'}`}><span className="text-xl">{item.icon}</span>{item.label}</Link>)}
      <button type="button" onClick={()=>setMobileMenuOpen(true)} className="flex-1 flex flex-col min-h-14 justify-center items-center text-xs"><span className="text-xl">☰</span>More</button>
    </nav>
  </>)
}
