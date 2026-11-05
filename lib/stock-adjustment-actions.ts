'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient, createSessionClient } from './supabase'

async function adminProfile() {
  const session = await createSessionClient()
  const { data: { user }, error: authError } = await session.auth.getUser()
  if (authError || !user) throw new Error('Sign in required')
  const { data: profile, error } = await session.rpc('vanstock_my_profile')
  if (error || !profile || profile.id !== user.id || profile.role !== 'admin')
    throw new Error('Administrator access required')
  return { profile, session }
}

export async function getAdjustmentOptions() {
  const { profile } = await adminProfile()
  const db = createServerClient()
  const [vans, warehouses, products, vanStock, warehouseStock] = await Promise.all([
    db.from('vans').select('id,van_number').eq('company_id', profile.company_id).order('van_number'),
    db.from('warehouses').select('id,name').eq('company_id', profile.company_id).order('name'),
    db.from('products').select('id,name,stock_unit').eq('company_id', profile.company_id).is('archived_at', null).order('name'),
    db.from('stock').select('van_id,product_id,quantity,vans!inner(company_id)').eq('vans.company_id', profile.company_id),
    db.from('warehouse_stock').select('warehouse_id,product_id,quantity,warehouses!inner(company_id)').eq('warehouses.company_id', profile.company_id),
  ])
  for (const result of [vans, warehouses, products, vanStock, warehouseStock]) {
    if (result.error) throw new Error('Could not load stock adjustment data')
  }
  return {
    vans: vans.data ?? [], warehouses: warehouses.data ?? [], products: products.data ?? [],
    balances: [
      ...(vanStock.data ?? []).map(row => ({ location: `van:${row.van_id}`, productId: row.product_id, quantity: Number(row.quantity) })),
      ...(warehouseStock.data ?? []).map(row => ({ location: `warehouse:${row.warehouse_id}`, productId: row.product_id, quantity: Number(row.quantity) })),
    ],
  }
}

export async function submitStockCorrection(input: {
  location: string
  productId: string
  operation: 'add' | 'remove' | 'set'
  quantity: number
  reference: string
}) {
  try {
    const { profile, session } = await adminProfile()
    const [kind, locationId] = input.location.split(':')
    if (!['van', 'warehouse'].includes(kind) || !locationId || !input.productId ||
      !['add','remove','set'].includes(input.operation) ||
      !Number.isFinite(input.quantity) || input.quantity < 0 ||
      input.quantity >= 1000000000 ||
      Math.abs(input.quantity * 100 - Math.round(input.quantity * 100)) > 1e-7 ||
      (input.operation !== 'set' && input.quantity === 0) ||
      !input.reference.trim() || input.reference.length > 500) {
      return { error: 'Enter a valid location, product, quantity and adjustment reason.' }
    }
    // The live database RPC also checks the authenticated role, company ownership,
    // unit precision, non-negative balance, and writes an audit entry atomically.
    const db = createServerClient()
    const table = kind === 'van' ? 'vans' : 'warehouses'
    const { data: allowed, error: lookupError } = await db.from(table).select('id')
      .eq('id', locationId).eq('company_id', profile.company_id).maybeSingle()
    if (lookupError || !allowed) return { error: 'Location not available for this company.' }

    const { error } = kind === 'van'
      ? await session.rpc('vanstock_admin_adjust_van', {
          p_van_id: locationId, p_product_id: input.productId,
          p_operation: input.operation, p_quantity: input.quantity, p_reference: input.reference.trim(),
        })
      : await session.rpc('vanstock_warehouse_adjust', {
          p_warehouse_id: locationId, p_product_id: input.productId,
          p_operation: input.operation, p_quantity: input.quantity, p_reference: input.reference.trim(),
        })
    if (error) return { error: error.message }
    for (const path of ['/adjust-stock', '/dashboard', '/stock', '/fleet', '/warehouse', '/logs']) revalidatePath(path)
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save stock adjustment.' }
  }
}
