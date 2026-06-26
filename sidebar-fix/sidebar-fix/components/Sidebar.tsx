// ============================================================
// components/Sidebar.tsx   (FIX — replaces existing file)
//
// WHAT CHANGED:
// This is now a Server Component that fetches the REAL logged-in
// user's name, role, and van — then passes that data down to
// SidebarNav (a small Client Component) which handles the
// interactive bits (highlighting the active link, sign-out click).
//
// Previously, the name "James Miller" and role "Technician" were
// hardcoded text that never changed no matter who logged in.
// ============================================================

import { getCurrentUserDisplay } from '@/lib/actions'
import SidebarNav from './SidebarNav'

export default async function Sidebar() {
  const user = await getCurrentUserDisplay()

  return <SidebarNav user={user} />
}
