// ============================================================
// lib/actions.ts   (REPLACES your existing file)
//
// WHAT CHANGED:
// - signIn / signOut / getCurrentProfile now use createSessionClient()
//   (the cookie-aware client) instead of createServerClient()
//   (the admin client), because only the session client knows
//   who is actually logged in.
// - All other functions still use createServerClient() (admin)
//   for the actual data reads/writes, but first ask the session
//   client "who is this?" before doing anything.
// ============================================================

'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient, createSessionClient } from './supabase'
import type { TransferPayload, AdjustPayload } from '@/types'

// ── helpers ────────────────────────────────────────────────

// Get the currently logged-in user's profile.
// Uses the SESSION client to find out who's logged in (reads cookies),
// then uses the ADMIN client to fetch their full profile data.
async function getCurrentProfile() {
  const sessionClient = await createSessionClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()

  if (authError || !user) throw new Error('Not logged in')

  const db = createServerClient()
  const { data: profile, error } = await db
    .from('profiles')
    .select('*, van:vans(van_number)')
    .eq('id', user.id)
    .single()

  if (error || !profile) throw new Error('Profile not found — check your profiles table has a row for this user')
  return profile
}

// ── AUTH ───────────────────────────────────────────────────

// Log in with email and password — uses the session client so the
// resulting login is remembered via cookies on future requests.
export async function signIn(email: string, password: string) {
  const sessionClient = await createSessionClient()
  const { error } = await sessionClient.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  revalidatePath('/')
  return { success: true }
}

// Log out — also needs the session client to clear the right cookie
export async function signOut() {
  const sessionClient = await createSessionClient()
  await sessionClient.auth.signOut()
  revalidatePath('/')
}

// ── DASHBOARD ──────────────────────────────────────────────

export async function getDashboardStats() {
  const profile = await getCurrentProfile()
  if (!profile.van_id) return null

  const db = createServerClient()

  const { data: stockItems } = await db
    .from('stock')
    .select('quantity, product:products(name, min_stock)')
    .eq('van_id', profile.van_id)

  const totalItems = stockItems?.filter(s => s.quantity > 0).length ?? 0
  const lowStockCount = stockItems?.filter(
    (s) => s.quantity < (s.product as any)?.min_stock
  ).length ?? 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: todayLogs } = await db
    .from('activity_log')
    .select('type, quantity')
    .eq('van_id', profile.van_id)
    .gte('created_at', today.toISOString())

  const transfersToday = todayLogs?.length ?? 0
  const issuedToday = todayLogs?.filter(l => l.type === 'issue').length ?? 0

  return { totalItems, lowStockCount, transfersToday, issuedToday }
}

// ── STOCK ──────────────────────────────────────────────────

export async function getMyStock() {
  const profile = await getCurrentProfile()
  if (!profile.van_id) return []

  const db = createServerClient()
  const { data, error } = await db
    .from('stock')
    .select('*, product:products(*)')
    .eq('van_id', profile.van_id)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function adjustStock(payload: AdjustPayload) {
  const profile = await getCurrentProfile()
  if (!profile.van_id) return { error: 'No van assigned' }
  if (!['add', 'remove', 'set'].includes(payload.action)) return { error: 'Invalid adjustment' }
  if (!Number.isFinite(payload.quantity) || payload.quantity < 0 ||
      (payload.quantity === 0 && payload.action !== 'set')) {
    return { error: 'Enter a valid quantity' }
  }
  if (!payload.reason?.trim()) return { error: 'A reason is required' }

  // Session-scoped RPC uses auth.uid() and a database transaction. Never use
  // the service-role client for end-user stock changes.
  const session = await createSessionClient()
  const { error } = await session.rpc('apply_van_stock_action', {
    p_product_id: payload.product_id,
    p_operation: 'adjust-' + payload.action,
    p_quantity: payload.quantity,
    p_reference: payload.reason.trim(),
    p_notes: '',
  })
  if (error) return { error: error.message }
  revalidatePath('/stock')
  revalidatePath('/dashboard')
  revalidatePath('/logs')
  return { success: true }
}

// ── TRANSFERS ──────────────────────────────────────────────

export async function recordTransfer(payload: TransferPayload) {
  const profile = await getCurrentProfile()
  if (!profile.van_id) return { error: 'No van assigned' }
  // Never pretend to transfer stock to a second location by merely debiting
  // the source van. Dedicated two-sided RPCs will handle those movements.
  if (payload.type === 'van-to-van' || payload.type === 'depot') {
    return { error: 'Use the warehouse or van-to-van transfer workflow when enabled.' }
  }
  if (payload.type !== 'issue' && payload.type !== 'return') {
    return { error: 'Unsupported transfer type' }
  }
  if (!payload.reference?.trim()) return { error: 'A reference is required' }
  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    return { error: 'Enter a positive quantity' }
  }
  const session = await createSessionClient()
  const { error } = await session.rpc('apply_van_stock_action', {
    p_product_id: payload.product_id,
    p_operation: payload.type,
    p_quantity: payload.quantity,
    p_reference: payload.reference.trim(),
    p_notes: payload.notes ?? '',
  })
  if (error) return { error: error.message }

  revalidatePath('/transfer')
  revalidatePath('/dashboard')
  revalidatePath('/stock')
  revalidatePath('/logs')
  return { success: true }
}

// ── ACTIVITY LOG ───────────────────────────────────────────

export async function getActivityLog(filterType?: string) {
  const profile = await getCurrentProfile()
  const db = createServerClient()

  let query = db
    .from('activity_log')
    .select('*, profile:profiles(full_name), van:vans(van_number)')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (profile.role === 'technician' && profile.van_id) {
    query = query.eq('van_id', profile.van_id)
  }

  if (filterType && filterType !== 'all') {
    query = query.eq('type', filterType)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

// ── PRODUCTS ───────────────────────────────────────────────

export async function getProducts() {
  const profile = await getCurrentProfile()
  const db = createServerClient()

  const { data, error } = await db
    .from('products')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('name')

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function addProduct(
  name: string,
  category: string,
  minStock: number,
  startingQty: number
) {
  const profile = await getCurrentProfile()

  if (!['manager', 'admin'].includes(profile.role)) {
    return { error: 'Only managers can add products' }
  }

  const db = createServerClient()

  const { data: product, error } = await db
    .from('products')
    .insert({ company_id: profile.company_id, name, category, min_stock: minStock })
    .select()
    .single()

  if (error) return { error: error.message }

  if (startingQty > 0 && profile.van_id) {
    await db.from('stock').upsert({
      van_id: profile.van_id,
      product_id: product.id,
      quantity: startingQty,
    })
  }

  revalidatePath('/admin')
  revalidatePath('/stock')
  return { success: true }
}

export async function removeProduct(productId: string) {
  const profile = await getCurrentProfile()

  if (!['manager', 'admin'].includes(profile.role)) {
    return { error: 'Only managers can remove products' }
  }

  const db = createServerClient()

  const { error } = await db
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('company_id', profile.company_id)

  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { success: true }
}

// ── ADMIN ──────────────────────────────────────────────────

export async function getAdminData() {
  const profile = await getCurrentProfile()

  if (!['manager', 'admin'].includes(profile.role)) {
    return { vans: [], profiles: [] }
  }

  const db = createServerClient()

  const [{ data: vans }, { data: profiles }] = await Promise.all([
    db.from('vans').select('*').eq('company_id', profile.company_id),
    db.from('profiles').select('*, van:vans(van_number)').eq('company_id', profile.company_id),
  ])

  return { vans: vans ?? [], profiles: profiles ?? [] }
}
// ============================================================
// ADD THIS FUNCTION to your existing lib/actions.ts file
// Paste it anywhere inside the file (e.g. just below getCurrentProfile,
// or at the very end before the final closing — doesn't matter where,
// as long as it's a top-level function in the file).
//
// WHAT IT DOES:
// Returns a simplified version of the logged-in user's info —
// just their name, role, and van number — safe to show in the
// sidebar UI. Returns null if nobody is logged in (so the sidebar
// can show a fallback instead of crashing).
// ============================================================

export async function getCurrentUserDisplay() {
  try {
    const profile = await getCurrentProfile()
    return {
      full_name: profile.full_name,
      role: profile.role,
      van_number: (profile.van as any)?.van_number ?? null,
    }
  } catch {
    // Not logged in, or profile not found — return null so the
    // sidebar can show a safe fallback instead of throwing an error
    return null
  }
}


// ── WAREHOUSE USER PERMISSIONS (requires SQL migration) ─────────
// Only administrators can read or update the permission register.
export async function getWarehousePermissionData() {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') return null
  const db = createServerClient()
  const { data, error } = await db
    .from('user_warehouse_permissions')
    .select('user_id, can_view, can_request, can_issue, can_receive, can_adjust, can_stocktake')
    .eq('company_id', profile.company_id)
  if (error) throw new Error('Warehouse permissions are not installed: ' + error.message)
  return data ?? []
}

export async function saveWarehousePermissions(
  userId: string,
  permissions: {
    can_view: boolean
    can_request: boolean
    can_issue: boolean
    can_receive: boolean
    can_adjust: boolean
    can_stocktake: boolean
  }
) {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') return { error: 'Administrator access required' }
  if (!userId || Object.values(permissions).some(value => typeof value !== 'boolean')) {
    return { error: 'Invalid permission settings' }
  }

  const sessionClient = await createSessionClient()
  const { error } = await sessionClient.rpc('set_warehouse_user_permissions', {
    p_user_id: userId,
    p_can_view: permissions.can_view,
    p_can_request: permissions.can_request,
    p_can_issue: permissions.can_issue,
    p_can_receive: permissions.can_receive,
    p_can_adjust: permissions.can_adjust,
    p_can_stocktake: permissions.can_stocktake,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { success: true }
}


// ── READ-ONLY WAREHOUSE OVERVIEW ────────────────────────────
// This page is available only after the staged warehouse migration.
// Never return cross-company warehouse records.
export async function getWarehouseOverview() {
  const profile = await getCurrentProfile()
  const allowedRoles = ['admin', 'manager']
  if (!allowedRoles.includes(profile.role)) {
    throw new Error('Warehouse management access required')
  }

  const db = createServerClient()
  const { data: warehouses, error: warehouseError } = await db
    .from('warehouses')
    .select('id, name, company_id')
    .eq('company_id', profile.company_id)
    .order('name')

  if (warehouseError) {
    // Before applying the database migration, display a safe setup state.
    if (warehouseError.code === '42P01' || warehouseError.code === 'PGRST205') {
      return { setupRequired: true as const, warehouses: [], items: [] }
    }
    throw new Error('Could not read warehouse locations: ' + warehouseError.message)
  }

  const warehouseIds = (warehouses ?? []).map((w) => w.id)
  if (warehouseIds.length === 0) {
    return { setupRequired: false as const, warehouses: [], items: [] }
  }

  const { data: balances, error: balanceError } = await db
    .from('warehouse_stock')
    .select('warehouse_id, product_id, quantity, product:products(name, category)')
    .in('warehouse_id', warehouseIds)
    .order('product_id')

  if (balanceError) throw new Error('Could not read warehouse balances: ' + balanceError.message)
  return {
    setupRequired: false as const,
    warehouses: warehouses ?? [],
    items: (balances ?? []).map((item) => ({
      warehouse_id: item.warehouse_id,
      product_id: item.product_id,
      quantity: item.quantity,
      product_name: (item.product as any)?.name ?? 'Unknown product',
      category: (item.product as any)?.category ?? 'Other',
    })),
  }
}
