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

  const totalItems = stockItems?.reduce((sum, s) => sum + s.quantity, 0) ?? 0
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
  const issuedToday = todayLogs
    ?.filter(l => l.type === 'issue')
    .reduce((sum, l) => sum + l.quantity, 0) ?? 0

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
  if (!profile.van_id) throw new Error('No van assigned')

  const db = createServerClient()

  const { data: current } = await db
    .from('stock')
    .select('quantity')
    .eq('van_id', profile.van_id)
    .eq('product_id', payload.product_id)
    .single()

  const prev = current?.quantity ?? 0
  let newQty: number

  if (payload.action === 'add') newQty = prev + payload.quantity
  else if (payload.action === 'remove') newQty = Math.max(0, prev - payload.quantity)
  else newQty = payload.quantity

  const { error } = await db
    .from('stock')
    .upsert({
      van_id: profile.van_id,
      product_id: payload.product_id,
      quantity: newQty,
      updated_at: new Date().toISOString(),
    })

  if (error) return { error: error.message }

  const { data: product } = await db
    .from('products')
    .select('name')
    .eq('id', payload.product_id)
    .single()

  await db.from('activity_log').insert({
    company_id: profile.company_id,
    van_id: profile.van_id,
    user_id: profile.id,
    product_id: payload.product_id,
    product_name: product?.name ?? 'Unknown',
    type: 'adjust',
    quantity: Math.abs(newQty - prev) || payload.quantity,
    reference: payload.reason,
  })

  revalidatePath('/stock')
  revalidatePath('/dashboard')
  return { success: true }
}

// ── TRANSFERS ──────────────────────────────────────────────

export async function recordTransfer(payload: TransferPayload) {
  const profile = await getCurrentProfile()
  if (!profile.van_id) throw new Error('No van assigned')

  const db = createServerClient()

  const { data: current } = await db
    .from('stock')
    .select('quantity')
    .eq('van_id', profile.van_id)
    .eq('product_id', payload.product_id)
    .single()

  const currentQty = current?.quantity ?? 0
  let newQty = currentQty

  if (payload.type === 'issue' || payload.type === 'depot' || payload.type === 'van-to-van') {
    if (currentQty < payload.quantity) return { error: 'Not enough stock on van' }
    newQty = currentQty - payload.quantity
  } else if (payload.type === 'return') {
    newQty = currentQty + payload.quantity
  }

  const { error: stockError } = await db
    .from('stock')
    .upsert({
      van_id: profile.van_id,
      product_id: payload.product_id,
      quantity: newQty,
      updated_at: new Date().toISOString(),
    })

  if (stockError) return { error: stockError.message }

  const { data: product } = await db
    .from('products')
    .select('name')
    .eq('id', payload.product_id)
    .single()

  await db.from('activity_log').insert({
    company_id: profile.company_id,
    van_id: profile.van_id,
    user_id: profile.id,
    product_id: payload.product_id,
    product_name: product?.name ?? 'Unknown',
    type: payload.type,
    quantity: payload.quantity,
    reference: payload.reference,
    notes: payload.notes ?? null,
  })

  revalidatePath('/transfer')
  revalidatePath('/dashboard')
  revalidatePath('/stock')
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
