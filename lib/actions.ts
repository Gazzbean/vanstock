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

  // Fail closed: an unassigned technician must never receive company-wide
  // logs through the service-role query.
  if (profile.role === 'technician') {
    if (!profile.van_id) return []
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
    .is('archived_at', null)
    .order('name')

  if (error) throw new Error(error.message)
  return data ?? []
}

// The full catalogue is used by managers; operational selectors show only
// active products. Archived records remain visible in administration.
export async function getAdminProducts() {
  const profile = await getCurrentProfile()
  if (!['manager', 'admin'].includes(profile.role)) throw new Error('Manager access required')
  const db = createServerClient()
  const { data, error } = await db.from('products')
    .select('*').eq('company_id', profile.company_id).order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function setProductArchived(productId: string, archive: boolean) {
  if (process.env.WAREHOUSE_WRITES_ENABLED === 'false') {
    return { error: 'Catalogue archiving is not enabled yet.' }
  }
  const profile = await getCurrentProfile()
  if (!['manager', 'admin'].includes(profile.role)) {
    return { error: 'Manager access required' }
  }
  if (!productId || typeof archive !== 'boolean') return { error: 'Invalid product or action' }
  const session = await createSessionClient()
  const { error } = await session.rpc('set_product_archived', {
    p_product_id: productId,
    p_archive: archive,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin')
  revalidatePath('/warehouse')
  revalidatePath('/transfer')
  revalidatePath('/stock')
  return { success: true }
}

export async function addProduct(
  name: string,
  category: string,
  minStock: number,
  startingQty: number,
  stockUnit: 'ea' | 'kg' | 'm' | 'pack' | 'container' = 'ea',
) {
  const profile = await getCurrentProfile()

  if (!['manager', 'admin'].includes(profile.role)) {
    return { error: 'Only managers can add products' }
  }
  if (!name?.trim() || name.trim().length > 200 || !category?.trim()) {
    return { error: 'Enter a valid product name and category' }
  }
  if (!['ea', 'kg', 'm', 'pack', 'container'].includes(stockUnit)) {
    return { error: 'Select a valid stock unit' }
  }
  if (!Number.isFinite(minStock) || minStock < 0 ||
      Math.abs(minStock * 100 - Math.round(minStock * 100)) > 1e-7 ||
      (['ea', 'pack', 'container'].includes(stockUnit) && !Number.isSafeInteger(minStock))) {
    return { error: 'Minimum stock quantity must match the selected unit' }
  }
  // Initial stock must be counted and audited separately, not fabricated here.
  if (startingQty !== 0) {
    return { error: 'Opening stock must be entered through the stocktake procedure.' }
  }
  const db = createServerClient()
  const { error } = await db.from('products').insert({
    company_id: profile.company_id,
    name: name.trim(),
    category: category.trim(),
    min_stock: minStock,
    stock_unit: stockUnit,
  })
  if (error) return { error: error.message }

  revalidatePath('/admin')
  revalidatePath('/stock')
  revalidatePath('/warehouse')
  return { success: true }
}

// Destructive product deletion is suspended until an audited archive/retire
// operation is implemented. Existing stock references products ON DELETE CASCADE.
export async function removeProduct(productId: string) {
  const profile = await getCurrentProfile()
  if (!['manager', 'admin'].includes(profile.role)) {
    return { error: 'Manager access required' }
  }
  return { error: 'Product deletion is disabled to protect van stock and inventory history. A product archive option will be added.' }
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


// ── WAREHOUSE WRITE ACTIONS: RELEASE GATED ─────────────────────
// Warehouse writes are enabled after verified production migrations.
// Set WAREHOUSE_WRITES_ENABLED=false to disable them quickly.
export async function postWarehouseOpeningStock(
  warehouseId: string, productId: string, quantity: number, stocktakeReference: string,
) {
  if (process.env.WAREHOUSE_WRITES_ENABLED === 'false') {
    return { error: 'Opening stock posting is not yet enabled.' }
  }
  const profile = await getCurrentProfile()
  if (!['admin', 'manager'].includes(profile.role)) {
    return { error: 'Administrator or Manager access required.' }
  }
  if (!warehouseId || !productId || !stocktakeReference?.trim() ||
      !Number.isFinite(quantity) || quantity < 0) {
    return { error: 'Complete the warehouse, product, quantity and stocktake reference.' }
  }
  const session = await createSessionClient()
  const { error } = await session.rpc('post_warehouse_opening_stock', {
    p_warehouse_id: warehouseId,
    p_product_id: productId,
    p_count: quantity,
    p_stocktake_reference: stocktakeReference.trim(),
  })
  if (error) return { error: error.message }
  revalidatePath('/warehouse')
  revalidatePath('/logs')
  return { success: true }
}

export async function transferWarehouseToVan(
  warehouseId: string, vanId: string, productId: string, quantity: number,
  reference: string,
) {
  if (process.env.WAREHOUSE_WRITES_ENABLED === 'false') {
    return { error: 'Warehouse replenishment is not yet enabled.' }
  }
  const profile = await getCurrentProfile()
  if (!['admin', 'manager'].includes(profile.role)) {
    return { error: 'Warehouse issue permission required.' }
  }
  if (!warehouseId || !vanId || !productId || !reference?.trim() ||
      !Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Complete the warehouse, receiving van, product, quantity and reference.' }
  }
  const session = await createSessionClient()
  const { error } = await session.rpc('move_warehouse_van_stock', {
    p_warehouse_id: warehouseId,
    p_van_id: vanId,
    p_product_id: productId,
    p_quantity: quantity,
    p_direction: 'warehouse-to-van',
    p_reference: reference.trim(),
    p_notes: '',
  })
  if (error) return { error: error.message }
  revalidatePath('/warehouse')
  revalidatePath('/stock')
  revalidatePath('/dashboard')
  revalidatePath('/logs')
  return { success: true }
}


// Warehouse returns and adjustments use database RPCs: both write a single audit event.
export async function returnVanStockToWarehouse(
  warehouseId: string, vanId: string, productId: string,
  quantity: number, reference: string,
) {
  if (process.env.WAREHOUSE_WRITES_ENABLED === 'false') return { error: 'Warehouse operations disabled.' }
  const profile = await getCurrentProfile()
  if (!['admin','manager'].includes(profile.role)) return { error: 'Manager access required.' }
  if (!warehouseId || !vanId || !productId || !reference?.trim() ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-7) {
    return { error: 'Enter a valid return quantity (up to two decimal places) and reference.' }
  }
  const session = await createSessionClient()
  const { error } = await session.rpc('move_warehouse_van_stock', {
    p_warehouse_id: warehouseId, p_van_id: vanId,
    p_product_id: productId, p_quantity: quantity,
    p_direction: 'van-to-warehouse', p_reference: reference.trim(), p_notes: '',
  })
  if (error) return { error: error.message }
  for (const path of ['/warehouse','/stock','/dashboard','/logs']) revalidatePath(path)
  return { success: true }
}

export async function adjustWarehouseStock(
  warehouseId: string, productId: string, operation: 'add'|'remove'|'set',
  quantity: number, reference: string,
) {
  if (process.env.WAREHOUSE_WRITES_ENABLED === 'false') return { error: 'Warehouse operations disabled.' }
  const profile = await getCurrentProfile()
  if (!['admin','manager'].includes(profile.role)) return { error: 'Manager access required.' }
  if (!warehouseId || !productId || !['add','remove','set'].includes(operation) ||
      !reference?.trim() || !Number.isFinite(quantity) || quantity < 0 ||
      (operation !== 'set' && quantity === 0) ||
      Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-7) {
    return { error: 'Enter a valid adjustment quantity and reference.' }
  }
  const session = await createSessionClient()
  const { error } = await session.rpc('adjust_warehouse_stock', {
    p_warehouse_id: warehouseId, p_product_id: productId,
    p_operation: operation, p_quantity: quantity, p_reference: reference.trim(),
  })
  if (error) return { error: error.message }
  revalidatePath('/warehouse')
  revalidatePath('/logs')
  return { success: true }
}


type CatalogueImportItem = {
  name: string
  category: string
  stock_unit: 'ea'|'kg'|'m'|'pack'|'container'
  min_stock: number
}

// One request, one database INSERT: either all validated products are created or none.
// Stock balances are deliberately excluded; the separate opening stocktake remains authoritative.
export async function importProductCatalogue(items: CatalogueImportItem[]) {
  const profile = await getCurrentProfile()
  if (!['admin','manager'].includes(profile.role)) return { error: 'Manager access required.' }
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    return { error: 'Import between 1 and 200 products at a time.' }
  }
  const allowedUnits = ['ea','kg','m','pack','container']
  const normalized = new Set<string>()
  for (const item of items) {
    if (typeof item?.name !== 'string' || !item.name.trim() ||
        item.name.trim().length > 200 || typeof item.category !== 'string' ||
        !item.category.trim() || item.category.trim().length > 100 ||
        !allowedUnits.includes(item.stock_unit) ||
        !Number.isFinite(item.min_stock) || item.min_stock < 0 ||
        item.min_stock >= 1000000000 ||
        Math.abs(item.min_stock*100-Math.round(item.min_stock*100)) > 1e-7 ||
        (['ea','pack','container'].includes(item.stock_unit) &&
          !Number.isSafeInteger(item.min_stock))) {
      return { error: 'Invalid product, category, unit or minimum stock in the import.' }
    }
    const key = item.name.trim().toLowerCase()
    if (normalized.has(key)) return { error: 'Duplicate name in import: ' + item.name.trim() }
    normalized.add(key)
  }
  const db = createServerClient()
  const { data: existing, error: readError } = await db.from('products')
    .select('name').eq('company_id',profile.company_id)
  if (readError) return { error: 'Cannot check existing catalogue: '+readError.message }
  const names = new Set((existing ?? []).map(item => item.name.trim().toLowerCase()))
  const duplicate = items.find(item => names.has(item.name.trim().toLowerCase()))
  if (duplicate) return { error: 'Already exists in catalogue (including archived items): '+duplicate.name }
  const { error } = await db.from('products').insert(items.map(item => ({
    company_id: profile.company_id,
    name: item.name.trim(),
    category: item.category.trim(),
    stock_unit: item.stock_unit,
    min_stock: item.min_stock,
  })))
  if (error) return { error: error.code === '23505'
    ? 'One or more product names already exist. No products imported.'
    : error.message }
  revalidatePath('/admin')
  revalidatePath('/warehouse')
  return { success: true, imported: items.length }
}


export async function updateCatalogueProduct(
  productId: string, name: string, category: string,
  stockUnit: 'ea' | 'kg' | 'm' | 'pack' | 'container', minStock: number,
) {
  const profile = await getCurrentProfile()
  if (!['admin','manager'].includes(profile.role)) return { error: 'Manager access required.' }
  if (!productId || !name?.trim() || name.trim().length > 200 ||
      !category?.trim() || category.trim().length > 100 ||
      !['ea','kg','m','pack','container'].includes(stockUnit) ||
      !Number.isFinite(minStock) || minStock < 0 || minStock >= 1000000000 ||
      Math.abs(minStock*100 - Math.round(minStock*100)) > 1e-7 ||
      (['ea','pack','container'].includes(stockUnit) && !Number.isSafeInteger(minStock))) {
    return { error: 'Check product name, category, stock unit and minimum stock quantity.' }
  }
  const session = await createSessionClient()
  const { error } = await session.rpc('update_catalogue_product', {
    p_product_id: productId,
    p_name: name.trim(),
    p_category: category.trim(),
    p_stock_unit: stockUnit,
    p_min_stock: minStock,
  })
  if (error) return { error: error.message }
  for (const path of ['/admin','/warehouse','/stock','/dashboard','/transfer']) revalidatePath(path)
  return { success: true }
}


// ── PHASE 1A: CATALOGUE SETTINGS (metadata only) ─────────
export async function getPhase1CatalogueSettings(){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role)) throw new Error('Manager access required')
 const db=createServerClient()
 const [settings,groups]=await Promise.all([
  db.from('product_settings').select('product_id,tracking_type,servicem8_material_uuid,servicem8_item_number,mapping_status').eq('company_id',p.company_id),
  db.from('consumables_groups').select('id,name,unit,quick_1,quick_2,quick_3,quick_4').eq('company_id',p.company_id).order('name'),
 ])
 if(settings.error) throw new Error(settings.error.message)
 if(groups.error) throw new Error(groups.error.message)
 return {settings:settings.data??[],groups:groups.data??[]}
}
export async function saveCatalogueSettings(productId:string,trackingType:string,mappingStatus:string,materialUuid:string,itemNumber:string){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role))return {error:'Manager access required'}
 if(!['stocked','bulk_consumable','cylinder','kit','reference_only','billing_only'].includes(trackingType)
  || !['unlinked','linked','needs_review','vanstock_only'].includes(mappingStatus)
  || typeof materialUuid!=='string'||materialUuid.length>120
  || typeof itemNumber!=='string'||itemNumber.length>120
  || (mappingStatus==='linked'&&!materialUuid.trim()))return {error:'Invalid tracking or ServiceM8 mapping settings'}
 // Until the cylinder and bulk-unit migration exists, prevent unsafe reclassification
 // of products already involved in physical stock or audit history.
 if(trackingType!=='stocked'){
   const db=createServerClient()
   const {data:product,error:productError}=await db.from('products').select('id').eq('id',productId).eq('company_id',p.company_id).maybeSingle()
   if(productError||!product)return {error:'Product not found for this company'}
   const [van,warehouse,logs]=await Promise.all([
     db.from('stock').select('id').eq('product_id',productId).limit(1),
     db.from('warehouse_stock').select('product_id').eq('product_id',productId).limit(1),
     db.from('activity_log').select('id').eq('product_id',productId).limit(1),
   ])
   if(van.error||warehouse.error||logs.error)return {error:'Cannot verify product inventory history'}
   if(van.data?.length||warehouse.data?.length||logs.data?.length)
     return {error:'This product has stock or transaction history. Changing its tracking type requires a controlled migration.'}
 }
 const session=await createSessionClient()
 // Product company membership is enforced again by a composite database FK.
 const {error}=await session.from('product_settings').upsert({
  product_id:productId,company_id:p.company_id,tracking_type:trackingType,
  mapping_status:mappingStatus,servicem8_material_uuid:materialUuid.trim()||null,
  servicem8_item_number:itemNumber.trim()||null,updated_at:new Date().toISOString(),
 },{onConflict:'product_id'})
 if(error)return {error:error.message}
 revalidatePath('/admin')
 return {success:true}
}
export async function saveConsumablesGroup(groupId:string,quantities:number[]){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role))return {error:'Manager access required'}
 if(!Array.isArray(quantities)||quantities.length!==4
 || quantities.some(q=>!Number.isFinite(q)||q<=0||q>=1000000000||Math.abs(q*100-Math.round(q*100))>1e-7)
 || quantities.some((q,i)=>i>0&&q<=quantities[i-1]))
 return {error:'Exactly four increasing, positive quantities are required (maximum two decimal places).'}
 const session=await createSessionClient()
 const {data,error}=await session.from('consumables_groups')
  .update({quick_1:quantities[0],quick_2:quantities[1],quick_3:quantities[2],quick_4:quantities[3],updated_at:new Date().toISOString()})
  .eq('id',groupId).eq('company_id',p.company_id).select('id')
 if(error)return {error:error.message}
 if(!data?.length)return {error:'Consumables group not found or not authorised'}
 revalidatePath('/admin')
 return {success:true}
}


// ── PHASE 1B: suppliers, purchase packages and bins ───────
export async function getPhase1BSupplierData(){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role))throw new Error('Manager access required')
 const db=createServerClient()
 const [suppliers,options,bins,vans,warehouses]=await Promise.all([
   db.from('suppliers').select('id,name,account_number,active').eq('company_id',p.company_id).order('name'),
   db.from('supplier_product_options').select('id,product_id,supplier_id,supplier_code,package_label,purchase_unit,units_per_package,preferred').eq('company_id',p.company_id),
   db.from('product_bins').select('id,product_id,van_id,warehouse_id,bin_label').eq('company_id',p.company_id),
   db.from('vans').select('id,van_number').eq('company_id',p.company_id).order('van_number'),
   db.from('warehouses').select('id,name').eq('company_id',p.company_id).order('name'),
 ])
 for(const r of [suppliers,options,bins,vans,warehouses])if(r.error)throw new Error(r.error.message)
 return {suppliers:suppliers.data??[],options:options.data??[],bins:bins.data??[],vans:vans.data??[],warehouses:warehouses.data??[]}
}
export async function addCatalogueSupplier(name:string,accountNumber:string){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role))return {error:'Manager access required'}
 if(typeof name!=='string'||!name.trim()||name.trim().length>120||typeof accountNumber!=='string'||accountNumber.length>100)return {error:'Invalid supplier details'}
 const session=await createSessionClient()
 const {error}=await session.from('suppliers').insert({company_id:p.company_id,name:name.trim(),account_number:accountNumber.trim()||null})
 if(error)return {error:error.code==='23505'?'Supplier already exists':error.message}
 revalidatePath('/admin')
 return {success:true}
}
export async function addSupplierPackage(productId:string,supplierId:string,supplierCode:string,packageLabel:string,purchaseUnit:string,unitsPerPackage:number){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role))return {error:'Manager access required'}
 if(!productId||!supplierId||typeof supplierCode!=='string'||supplierCode.length>120||
 typeof packageLabel!=='string'||!packageLabel.trim()||packageLabel.trim().length>100||
 !['ea','kg','m','pack','container','roll','box','cylinder'].includes(purchaseUnit)||
 !Number.isFinite(unitsPerPackage)||unitsPerPackage<=0||unitsPerPackage>=1000000000||
 Math.abs(unitsPerPackage*100-Math.round(unitsPerPackage*100))>1e-7)
 return {error:'Invalid supplier package. Use a positive quantity with at most two decimals.'}
 const session=await createSessionClient()
 const {error}=await session.from('supplier_product_options').insert({
   company_id:p.company_id,product_id:productId,supplier_id:supplierId,
   supplier_code:supplierCode.trim()||null,package_label:packageLabel.trim(),
   purchase_unit:purchaseUnit,units_per_package:unitsPerPackage
 })
 if(error)return {error:error.code==='23505'?'This supplier package already exists':error.message}
 revalidatePath('/admin')
 return {success:true}
}
export async function saveProductBin(productId:string,locationType:'van'|'warehouse',locationId:string,binLabel:string){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role))return {error:'Manager access required'}
 if(!productId||!locationId||!['van','warehouse'].includes(locationType)||
 typeof binLabel!=='string'||!binLabel.trim()||binLabel.trim().length>80)return {error:'Invalid bin or location'}
 const session=await createSessionClient()
 const existingQuery=session.from('product_bins').select('id').eq('company_id',p.company_id).eq('product_id',productId)
  .eq(locationType==='van'?'van_id':'warehouse_id',locationId)
 const {data:existing,error:lookupError}=await existingQuery.maybeSingle()
 if(lookupError)return {error:lookupError.message}
 const data={company_id:p.company_id,product_id:productId,van_id:locationType==='van'?locationId:null,
  warehouse_id:locationType==='warehouse'?locationId:null,bin_label:binLabel.trim()}
 const result=existing
  ? await session.from('product_bins').update({bin_label:binLabel.trim(),updated_at:new Date().toISOString()}).eq('id',existing.id)
  : await session.from('product_bins').insert(data)
 if(result.error)return {error:result.error.message}
 revalidatePath('/admin')
 return {success:true}
}


// ── PHASE 1C: PER-VAN STOCK STANDARDS ─────────────────────
export async function getVanStockStandardsAdmin(){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role)) throw new Error('Manager access required')
 const db=createServerClient()
 const {data,error}=await db.from('van_stock_standards')
   .select('id,van_id,product_id,classification,min_quantity,target_quantity')
   .eq('company_id',p.company_id)
 if(error)throw new Error(error.message)
 return data??[]
}
export async function saveVanStockStandard(
 vanId:string,productId:string,classification:string,minQuantity:number,targetQuantity:number,
){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role))return {error:'Manager access required'}
 if(!vanId||!productId||!['mandatory','preferred','optional','not_assigned'].includes(classification))
   return {error:'Invalid van, product or classification'}
 if(!Number.isFinite(minQuantity)||!Number.isFinite(targetQuantity)||
    minQuantity<0||targetQuantity<minQuantity||targetQuantity>=1000000000 ||
    [minQuantity,targetQuantity].some(q=>Math.abs(q*100-Math.round(q*100))>1e-7))
   return {error:'Enter valid minimum and target quantities (target must be at least minimum)'}
 if(['optional','not_assigned'].includes(classification) && (minQuantity!==0||targetQuantity!==0))
   return {error:'Optional and Not assigned items do not have routine stock targets'}
 const session=await createSessionClient()
 const [van,product]=await Promise.all([
   session.from('vans').select('id').eq('id',vanId).eq('company_id',p.company_id).maybeSingle(),
   session.from('products').select('id,stock_unit,archived_at').eq('id',productId).eq('company_id',p.company_id).maybeSingle(),
 ])
 if(van.error||product.error)return {error:'Could not verify van or product'}
 if(!van.data||!product.data||product.data.archived_at)return {error:'Select an active product and a valid van'}
 if(!['kg','m'].includes(product.data.stock_unit??'ea') &&
    (!Number.isSafeInteger(minQuantity)||!Number.isSafeInteger(targetQuantity)))
   return {error:'Whole-number quantities are required for this product unit'}
 const {error}=await session.from('van_stock_standards').upsert({
    company_id:p.company_id,van_id:vanId,product_id:productId,classification,
    min_quantity:minQuantity,target_quantity:targetQuantity,updated_at:new Date().toISOString(),
 },{onConflict:'van_id,product_id'})
 if(error)return {error:error.message}
 revalidatePath('/admin')
 return {success:true}
}


// ── PHASE 1D: READ-ONLY FLEET STOCK STANDARDS OVERVIEW ────
// Only return balances for vans belonging to the authenticated manager's company.
export async function getFleetStockOverview(){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role)) throw new Error('Manager access required')
 const db=createServerClient()
 const {data:vans,error:vanError}=await db.from('vans').select('id,van_number').eq('company_id',p.company_id).order('van_number')
 if(vanError)throw new Error(vanError.message)
 if(!vans?.length)return []
 const {data:rows,error}=await db.from('stock').select('van_id,product_id,quantity').in('van_id',vans.map(v=>v.id))
 if(error)throw new Error(error.message)
 return rows??[]
}


// ── PHASE 2A: ESTIMATED CONSUMABLE ISSUES ────────────────
export async function getConsumablesAssignments(){
 const p=await getCurrentProfile()
 const db=createServerClient()
 const [a,g]=await Promise.all([
  db.from('product_consumables_groups').select('product_id,group_id').eq('company_id',p.company_id),
  db.from('consumables_groups').select('id,name,unit,quick_1,quick_2,quick_3,quick_4').eq('company_id',p.company_id).eq('active',true),
 ])
 if(a.error||g.error)throw new Error(a.error?.message||g.error?.message)
 return {assignments:a.data??[],groups:g.data??[]}
}
export async function assignProductConsumablesGroup(productId:string,groupId:string){
 const p=await getCurrentProfile()
 if(!['admin','manager'].includes(p.role))return {error:'Manager access required'}
 const session=await createSessionClient()
 const [product,group]=await Promise.all([
   session.from('products').select('id,stock_unit,archived_at').eq('company_id',p.company_id).eq('id',productId).maybeSingle(),
   session.from('consumables_groups').select('id,unit').eq('company_id',p.company_id).eq('id',groupId).eq('active',true).maybeSingle(),
 ])
 if(product.error||group.error||!product.data||!group.data||product.data.archived_at)
  return {error:'Valid active product and group required'}
 if((product.data.stock_unit??'ea')!==group.data.unit)
  return {error:'Product stock unit must match consumables group unit'}
 const {error}=await session.from('product_consumables_groups').upsert({
  company_id:p.company_id,product_id:productId,group_id:groupId,updated_at:new Date().toISOString(),
 },{onConflict:'product_id'})
 if(error)return {error:error.message}
 revalidatePath('/admin');revalidatePath('/stock')
 return {success:true}
}
export async function issueEstimatedConsumable(productId:string,groupId:string,quantity:number,jobRef:string){
 const p=await getCurrentProfile()
 if(!p.van_id)return {error:'Assigned van required'}
 if(typeof jobRef!=='string'||!jobRef.trim()||jobRef.trim().length>120)
  return {error:'Enter a job reference (synthetic references only during testing)'}
 const session=await createSessionClient()
 // Read group options from the database instead of trusting amounts from the browser.
 const [a,g,product]=await Promise.all([
  session.from('product_consumables_groups').select('group_id').eq('product_id',productId).eq('company_id',p.company_id).maybeSingle(),
  session.from('consumables_groups').select('id,unit,quick_1,quick_2,quick_3,quick_4').eq('id',groupId).eq('company_id',p.company_id).eq('active',true).maybeSingle(),
  session.from('products').select('id,stock_unit,archived_at').eq('id',productId).eq('company_id',p.company_id).maybeSingle(),
 ])
 if(a.error||g.error||product.error||!a.data||!g.data||!product.data
  ||a.data.group_id!==groupId||product.data.archived_at||
  (product.data.stock_unit??'ea')!==g.data.unit)
  return {error:'Product is not assigned to the selected consumables group'}
 const allowed=[g.data.quick_1,g.data.quick_2,g.data.quick_3,g.data.quick_4].map(Number)
 if(!Number.isFinite(quantity)||!allowed.some(q=>q===quantity))
  return {error:'Select one of the four configured quantities'}
 const {error}=await session.rpc('apply_van_stock_action',{
  p_product_id:productId,p_operation:'issue',p_quantity:quantity,
  p_reference:jobRef.trim(),p_notes:'Estimated consumables usage; no ServiceM8 charge posted.',
 })
 if(error)return {error:error.message}
 for(const path of ['/stock','/dashboard','/logs','/admin'])revalidatePath(path)
 return {success:true}
}
