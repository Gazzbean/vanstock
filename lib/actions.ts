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
import { cookies } from 'next/headers'
import { createServerClient, createSessionClient } from './supabase'
import { isValidPackageConversion } from './package-conversion'
import { validQuickUseOptions } from './consumable-presets'
import { resolveWorkingVanId } from './working-van'
import { warehouseWritesEnabled } from './warehouse-release'
import { countTodayStockActivity, perthDayStartUtc } from './dashboard-activity'
import {buildStockDisplayRows} from './stock-standards'
import type { TransferPayload, AdjustPayload } from '@/types'

// ── helpers ────────────────────────────────────────────────

// Get the currently logged-in user's profile.
// Uses the SESSION client to find out who's logged in (reads cookies),
// then uses the ADMIN client to fetch their full profile data.
async function getCurrentProfile() {
  const sessionClient = await createSessionClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError || !user) throw new Error('Not logged in')
  const {data: profile,error} = await sessionClient.rpc('vanstock_my_profile')
  if(error){
    console.error('Secure profile lookup failed', {code:error.code,message:error.message})
    throw new Error('Could not load your VanStock profile.')
  }
  if(!profile || profile.id!==user.id)throw new Error('Authenticated profile not available')
  return profile
}

// Read capability settings from the company-scoped register.
// Never infer permissions from client-supplied roles or flags.
async function accessFor(profile:any){
 const db=createServerClient()
 const {data,error}=await db.from('user_access_capabilities')
  .select('office_access,technician_access,receive_stock,manage_catalogue,manage_users')
  .eq('user_id',profile.id).eq('company_id',profile.company_id).maybeSingle()
 if(error)throw new Error('Could not verify user access')
 return data??{office_access:false,technician_access:false,receive_stock:false,manage_catalogue:false,manage_users:false}
}

async function managerOperationAllowed(profile:any,permission:'maintain_catalogue'|'maintain_vehicles'){
 if(profile.role==='admin')return true
 if(profile.role!=='manager')return false
 const db=createServerClient()
 const {data,error}=await db.from('manager_operation_permissions').select(permission)
  .eq('company_id',profile.company_id).eq('user_id',profile.id).maybeSingle()
 if(error)throw new Error('Could not check Manager operations: '+error.message)
 return Boolean((data as Record<string,boolean>|null)?.[permission])
}

// ── AUTH ───────────────────────────────────────────────────
const workingVanCookie='vanstock-working-van'

// Log in with email and password — uses the session client so the
// resulting login is remembered via cookies on future requests.
export async function signIn(email: string, password: string) {
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return { error: 'Enter your email address and password.' }
  }
  const sessionClient = await createSessionClient()
  const { data, error } = await sessionClient.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return { error: error.message }
  if (!data.user) return { error: 'Could not confirm sign-in account.' }
  // Use the user returned by sign-in directly. Re-reading auth cookies in the
  // same server action can incorrectly report a missing profile.
  const {data:profile,error:profileError}=await sessionClient.rpc('vanstock_my_profile')
  if(profileError){
    console.error('Sign-in profile check failed', {code:profileError.code,message:profileError.message})
    await sessionClient.auth.signOut()
    return {error:'The account signed in, but its VanStock profile could not be verified.'}
  }
  if(!profile || profile.id!==data.user.id){
    await sessionClient.auth.signOut()
    return {error:'This account does not have an accessible VanStock profile.'}
  }
  cookies().delete(workingVanCookie)
  revalidatePath('/')
  return { success: true }
}

// Log out — also needs the session client to clear the right cookie
export async function signOut() {
  const sessionClient = await createSessionClient()
  await sessionClient.auth.signOut()
  cookies().delete(workingVanCookie)
  revalidatePath('/')
}

// ── DASHBOARD ──────────────────────────────────────────────

export async function getDashboardStats(selectedVanId?:string) {
  const working=await getWorkingVans(selectedVanId)
  if (!working.selectedId) return null

  const db = createServerClient()
  const [logs,stockItems,products,standards]=await Promise.all([
    db
    .from('activity_log')
    .select('type')
    .eq('company_id',(await getCurrentProfile()).company_id)
    .eq('van_id', working.selectedId)
    .gte('created_at',perthDayStartUtc(new Date())),
    getMyStock(working.selectedId),getProducts(),getWorkingVanStandards(working.selectedId),
  ])
  if(logs.error)throw new Error('Could not load today’s stock activity: '+logs.error.message)
  const rows=buildStockDisplayRows(products,stockItems,standards)
  return {
    totalItems:rows.filter(row=>row.quantity>0).length,
    lowStockCount:rows.filter(row=>row.status==='Critical'||row.status==='Low').length,
    ...countTodayStockActivity(logs.data??[]),
  }
}

// ── STOCK ──────────────────────────────────────────────────

export async function getWorkingVans(selectedVanId?:string){
 const profile=await getCurrentProfile()
 if(!(await accessFor(profile)).technician_access)return {vans:[] as {id:string;van_number:string}[],selectedId:null as string|null,defaultId:null as string|null}
 const db=createServerClient()
 const {data:assignments,error}=await db.from('user_authorized_vans').select('van_id').eq('user_id',profile.id).eq('company_id',profile.company_id)
 if(error)throw new Error('Could not read authorised vans')
 const ids=(assignments??[]).map(v=>v.van_id)
 if(!ids.length){
  if(selectedVanId)throw new Error('You are not authorised to access that van')
  return {vans:[] as {id:string;van_number:string}[],selectedId:null as string|null,defaultId:null as string|null}
 }
 const {data:vans,error:vanError}=await db.from('vans').select('id,van_number').eq('company_id',profile.company_id).eq('active',true).in('id',ids).order('van_number')
 if(vanError)throw new Error(vanError.message)
 const authorised=(vans??[]).map(v=>v.id)
 const rawSaved=cookies().get(workingVanCookie)?.value??''
 const savedId=rawSaved.startsWith(profile.id+':')?rawSaved.slice(profile.id.length+1):null
 const selectedId=resolveWorkingVanId(authorised,selectedVanId,savedId,profile.van_id)
 return {vans:vans??[],selectedId,defaultId:authorised.includes(profile.van_id)?profile.van_id as string:null}
}

export async function setWorkingVanSelection(vanId:string){
 const profile=await getCurrentProfile()
 if(!(await accessFor(profile)).technician_access)return {error:'Technician access required'}
 if(typeof vanId!=='string')return {error:'Choose an authorised working van'}
 const previous=await getWorkingVans()
 let targetId:string|null=null
 if(vanId){
  try{
   const working=await getWorkingVans(vanId)
   if(working.selectedId!==vanId)return {error:'This van is not authorised for your account'}
   targetId=working.selectedId
  }catch{return {error:'This van is not authorised for your account'}}
 }else{
   // Clearing the selection returns to the authorised default, if any.
   targetId=previous.defaultId
 }
 if(previous.selectedId!==targetId){
   // Only this authenticated server action can read the previous selection cookie.
   // Never expose an RPC that lets a browser invent the previous van in the audit trail.
   const db=createServerClient()
   const {error}=await db.from('working_van_selection_events').insert({
     company_id:profile.company_id,user_id:profile.id,
     previous_van_id:previous.selectedId,selected_van_id:targetId,
   })
   if(error)return {error:'Could not record the working-van change. Selection was not changed.'}
 }
 if(vanId){
  cookies().set(workingVanCookie,profile.id+':'+vanId,{
   httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',
  })
 }else{
  cookies().delete(workingVanCookie)
 }
 for(const path of ['/dashboard','/stock','/receive','/transfer','/logs'])revalidatePath(path)
 return {success:true}
}

export async function getWorkingVanChangeHistory(from?:string,to?:string){
 const actor=await getCurrentProfile()
 const access=await accessFor(actor)
 if(!access.technician_access&&!access.office_access&&actor.role!=='admin')throw new Error('History access required')
 const db=createServerClient()
 let query=db.from('working_van_selection_events')
  .select('id,user_id,previous_van_id,selected_van_id,created_at,profile:profiles!working_van_selection_events_user_id_fkey(full_name,initials)')
  .eq('company_id',actor.company_id).order('created_at',{ascending:false}).limit(200)
 if(!access.office_access&&actor.role!=='admin')query=query.eq('user_id',actor.id)
 if(from&&/^\d{4}-\d{2}-\d{2}$/.test(from))query=query.gte('created_at',from+'T00:00:00+08:00')
 if(to&&/^\d{4}-\d{2}-\d{2}$/.test(to))query=query.lte('created_at',to+'T23:59:59.999+08:00')
 const [events,vans]=await Promise.all([
   query,db.from('vans').select('id,van_number').eq('company_id',actor.company_id),
 ])
 if(events.error||vans.error)throw new Error('Could not load working-van change history')
 const labels=new Map((vans.data??[]).map(v=>[v.id,v.van_number]))
 return (events.data??[]).map((event:any)=>({
   id:event.id,date:event.created_at,
   user:event.profile?.full_name??'Unknown user',initials:event.profile?.initials??null,
   previous:event.previous_van_id?labels.get(event.previous_van_id)??'Archived vehicle':'None',
   selected:event.selected_van_id?labels.get(event.selected_van_id)??'Archived vehicle':'None',
 }))
}
export async function getMyStock(selectedVanId?:string) {
  const profile = await getCurrentProfile()
  const working=await getWorkingVans(selectedVanId)
  if (!working.selectedId) return []

  const db = createServerClient()
  const { data, error } = await db
    .from('stock')
    .select('*, product:products(*)')
    .eq('van_id', working.selectedId)

  if (error) throw new Error(error.message)
  return data ?? []
}

// Company-wide, strictly read-only inventory inspection. Not a working-van selector.
export async function getFleetVanStock(viewVanId?:string){
 const actor=await getCurrentProfile()
 const rights=await accessFor(actor)
 if(actor.role!=='admin'&&!rights.office_access)throw new Error('Office access required')
 const db=createServerClient()
 const {data:vans,error:vanError}=await db.from('vans')
  .select('id,van_number,registration,active').eq('company_id',actor.company_id).eq('active',true).order('van_number')
 if(vanError)throw new Error('Could not load fleet vehicles')
 const selectedId=viewVanId??vans?.[0]?.id??null
 if(selectedId&&!vans?.some(v=>v.id===selectedId))throw new Error('Vehicle is not available in your company')
 if(!selectedId)return {vans:vans??[],selectedId:null,items:[],standards:[],assignedUsers:[]}
 const [stock,standards,users]=await Promise.all([
   db.from('stock').select('id,product_id,quantity,product:products(id,name,category,stock_unit,min_stock)')
    .eq('van_id',selectedId),
   db.from('van_stock_standards').select('product_id,classification,min_quantity,target_quantity')
    .eq('company_id',actor.company_id).eq('van_id',selectedId),
   db.from('profiles').select('full_name,initials').eq('company_id',actor.company_id).eq('van_id',selectedId).eq('is_active',true),
 ])
 if(stock.error||standards.error||users.error)throw new Error('Could not load fleet stock and standards')
 return {vans:vans??[],selectedId,items:stock.data??[],standards:standards.data??[],assignedUsers:users.data??[]}
}

// Fleet-wide read-only stock comparison for Office and Administration.
// Every balance is restricted to active vans in the signed-in user's company.
export async function getFleetStockComparison(){
 const actor=await getCurrentProfile()
 const rights=await accessFor(actor)
 if(actor.role!=='admin'&&!rights.office_access)throw new Error('Office access required')
 const db=createServerClient()
 const {data:vans,error:vanError}=await db.from('vans')
  .select('id,van_number').eq('company_id',actor.company_id).eq('active',true).order('van_number')
 if(vanError)throw new Error('Could not load company vans')
 const ids=(vans??[]).map(v=>v.id)
 if(!ids.length)return {vans:[] as {id:string;van_number:string}[],balances:[] as {van_id:string;product_id:string;quantity:number}[],products:[] as {id:string;name:string;category:string;stock_unit:string|null}[]}
 const [stock,products]=await Promise.all([
  db.from('stock').select('van_id,product_id,quantity').in('van_id',ids),
  // Retain archived products in historical balances until physically reconciled.
  db.from('products').select('id,name,category,stock_unit').eq('company_id',actor.company_id),
 ])
 if(stock.error||products.error)throw new Error('Could not load fleet stock balances')
 return {vans:vans??[],balances:stock.data??[],products:products.data??[]}
}

// Office users may identify the source van for outstanding job allocations
// without needing manager-level access to the staff administration directory.
export async function getCompanyVanLabels(){
 const actor=await getCurrentProfile()
 const rights=await accessFor(actor)
 if(actor.role!=='admin'&&actor.role!=='manager'&&!rights.office_access)
  throw new Error('Office access required')
 const db=createServerClient()
 const {data,error}=await db.from('vans').select('id,van_number')
  .eq('company_id',actor.company_id).order('van_number')
 if(error)throw new Error('Could not load company van numbers')
 return data??[]
}

// Load van-specific stocking requirements for exactly the authorised working van.
export async function getWorkingVanStandards(selectedVanId?:string) {
  const profile = await getCurrentProfile()
  const working = await getWorkingVans(selectedVanId)
  if (!working.selectedId) return []
  const db = createServerClient()
  const {data,error} = await db.from('van_stock_standards')
    .select('product_id,classification,min_quantity,target_quantity')
    .eq('company_id',profile.company_id).eq('van_id',working.selectedId)
  if (error) throw new Error('Could not load van stock standards: '+error.message)
  return data??[]
}

export async function adjustStock(payload: AdjustPayload,selectedVanId?:string) {
  const profile = await getCurrentProfile()
  const working=await getWorkingVans(selectedVanId)
  if (!working.selectedId) return {error:'Choose an authorised working van'}
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
    p_selected_van_id:working.selectedId,
  })
  if (error) return { error: error.message }
  revalidatePath('/stock')
  revalidatePath('/dashboard')
  revalidatePath('/logs')
  return { success: true }
}

// ── TRANSFERS ──────────────────────────────────────────────

export async function recordJobMaterials(payload:{vanId:string;jobReference:string;mode:'used'|'allocated';siteLocation?:string;reason?:string;items:{product_id:string;quantity:number}[]}){
 const working=await getWorkingVans(payload.vanId)
 if(!working.selectedId||working.selectedId!==payload.vanId)return {error:'Choose an authorised Working Van'}
 if(!payload.jobReference?.trim()||payload.jobReference.length>120)return {error:'Job or project reference required'}
 if(!Array.isArray(payload.items)||payload.items.length<1||payload.items.length>50)return {error:'Add at least one material'}
 if(payload.items.some(x=>!x.product_id||!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>=1000000000))return {error:'Invalid material quantity'}
 if(payload.mode==='allocated'&&(!payload.siteLocation?.trim()||!payload.reason?.trim()))return {error:'Site location and reason are required for allocated materials'}
 if(payload.mode!=='used'&&payload.mode!=='allocated')return {error:'Invalid action'}
 const session=await createSessionClient()
 const {error}=await session.rpc('record_job_materials',{
  p_van_id:working.selectedId,p_job_reference:payload.jobReference.trim(),p_items:payload.items,
  p_mode:payload.mode,p_site_location:payload.siteLocation?.trim()??null,p_reason:payload.reason?.trim()??null,
 })
 if(error)return {error:error.message}
 for(const path of ['/transfer','/stock','/dashboard','/logs'])revalidatePath(path)
 return {success:true}
}

export async function getJobMaterialAllocations(selectedVanId?:string){
 const profile=await getCurrentProfile()
 const access=await accessFor(profile)
 if(!access.technician_access&&!access.office_access)return []
 const db=createServerClient()
 let query=db.from('job_material_allocations')
  .select('id,van_id,product_id,quantity,job_reference,site_location,reason,created_at,status')
  .eq('company_id',profile.company_id).eq('status','on_site').order('created_at',{ascending:false}).limit(100)
 if(!access.office_access){
  const working=await getWorkingVans(selectedVanId)
  if(!working.selectedId)return []
  query=query.eq('van_id',working.selectedId)
 }
 const {data,error}=await query
 if(error)throw new Error('Could not load site allocations: '+error.message)
 return data??[]
}

export async function resolveJobMaterialAllocation(allocationId:string,resolution:'used'|'returned'){
 if(!allocationId||!['used','returned'].includes(resolution))return {error:'Invalid allocation resolution'}
 await getCurrentProfile()
 const session=await createSessionClient()
 const {error}=await session.rpc('resolve_job_material_allocation',{p_allocation_id:allocationId,p_resolution:resolution})
 if(error)return {error:error.message}
 for(const path of ['/transfer','/stock','/dashboard','/logs'])revalidatePath(path)
 return {success:true}
}

export async function recordTransfer(payload: TransferPayload,selectedVanId?:string) {
  const profile = await getCurrentProfile()
  const working=await getWorkingVans(selectedVanId)
  if (!working.selectedId) return {error:'Choose an authorised working van'}
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
    p_selected_van_id:working.selectedId,
  })
  if (error) return { error: error.message }

  revalidatePath('/transfer')
  revalidatePath('/dashboard')
  revalidatePath('/stock')
  revalidatePath('/logs')
  return { success: true }
}

// ── VAN-TO-VAN TRANSFERS: REQUEST THEN RECEIVE ──────────
export async function getVanTransferWorkspace(){
 const profile=await getCurrentProfile()
 const access=await accessFor(profile)
 if(!access.office_access&&!access.technician_access)throw new Error('Stock access required')
 const db=createServerClient()
 const [vansResult,productsResult,grantsResult,requestsResult,packagesResult]=await Promise.all([
  db.from('vans').select('id,van_number').eq('company_id',profile.company_id).eq('active',true).order('van_number'),
  db.from('products').select('id,name,stock_unit').eq('company_id',profile.company_id).is('archived_at',null).order('name'),
  db.from('user_authorized_vans').select('van_id').eq('company_id',profile.company_id).eq('user_id',profile.id),
  db.from('van_transfer_requests').select('id,source_van_id,destination_van_id,product_id,quantity,reason,status,transaction_reference,created_at,decision_reason')
   .eq('company_id',profile.company_id).order('created_at',{ascending:false}).limit(100),
  db.from('supplier_product_options').select('id,product_id,package_label,purchase_unit,units_per_package')
   .eq('company_id',profile.company_id).eq('active',true),
 ])
 if(vansResult.error||productsResult.error||grantsResult.error||requestsResult.error||packagesResult.error)
  throw new Error('Could not load van transfers')
 const assigned=new Set((grantsResult.data??[]).map(g=>g.van_id))
 const active=new Set((vansResult.data??[]).map(v=>v.id))
 const managed=Boolean(access.office_access&&['admin','manager'].includes(profile.role))
 const sources=(vansResult.data??[]).filter(v=>managed||assigned.has(v.id))
 const requests=(requestsResult.data??[]).filter(r=>managed||assigned.has(r.source_van_id)||assigned.has(r.destination_van_id))
 const stockIds=sources.map(v=>v.id)
 const stockResult=stockIds.length
  ?await db.from('stock').select('van_id,product_id,quantity').in('van_id',stockIds)
  :{data:[],error:null}
 if(stockResult.error)throw new Error('Could not load source van balances')
 return {
  vans:vansResult.data??[],sources,products:productsResult.data??[],packages:packagesResult.data??[],
  balances:stockResult.data??[],requests,managed,
  receiverVanIds:[...assigned].filter(id=>active.has(id)),
 }
}

export async function requestVanTransfer(
 sourceVanId:string,destinationVanId:string,productId:string,quantity:number,reason:string,
){
 const profile=await getCurrentProfile()
 const access=await accessFor(profile)
 if(!access.office_access&&!access.technician_access)return {error:'Stock access required'}
 if(!sourceVanId||!destinationVanId||sourceVanId===destinationVanId||!productId||
  !Number.isFinite(quantity)||quantity<=0||quantity>=1000000000||
  Math.abs(quantity*100-Math.round(quantity*100))>1e-7||
  typeof reason!=='string'||reason.trim().length<3||reason.trim().length>500)
  return {error:'Choose different vans, a product, valid quantity and a reason.'}
 const session=await createSessionClient()
 const {data,error}=await session.rpc('vanstock_request_van_transfer',{
  p_source_van_id:sourceVanId,p_destination_van_id:destinationVanId,
  p_product_id:productId,p_quantity:quantity,p_reason:reason.trim(),
 })
 if(error)return {error:error.message}
 revalidatePath('/van-transfers')
 return {success:true,id:String(data)}
}

export async function decideVanTransfer(id:string,approve:boolean,managementReason:string){
 if(!id||typeof approve!=='boolean'||typeof managementReason!=='string'||managementReason.length>500)
  return {error:'Invalid transfer decision'}
 await getCurrentProfile()
 const session=await createSessionClient()
 const {data,error}=await session.rpc('vanstock_decide_van_transfer',{
  p_request_id:id,p_approve:approve,p_decision_reason:managementReason.trim()||null,
 })
 if(error)return {error:error.message}
 for(const path of ['/van-transfers','/stock','/fleet','/dashboard','/logs'])revalidatePath(path)
 return {success:true,reference:String(data)}
}

// ── ACTIVITY LOG ───────────────────────────────────────────

export async function getActivityLog(filterType?: string, selectedVanId?:string) {
  const profile = await getCurrentProfile()
  const access = await accessFor(profile)
  if (!access.office_access && !access.technician_access) throw new Error('Activity access required')
  const db = createServerClient()

  let query = db
    .from('activity_log')
    .select('*, profile:profiles(full_name,initials), van:vans(van_number)')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(100)

  // Fail closed: an unassigned technician must never receive company-wide
  // logs through the service-role query.
  if (!access.office_access) {
    const working=await getWorkingVans(selectedVanId)
    if (!working.selectedId) return []
    query = query.eq('van_id', working.selectedId)
  }else if(selectedVanId){
    query=query.eq('van_id',selectedVanId)
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
  if (!(await managerOperationAllowed(profile,'maintain_catalogue'))) throw new Error('Catalogue permission required')
  const db = createServerClient()
  const { data, error } = await db.from('products')
    .select('*').eq('company_id', profile.company_id).order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function setProductArchived(productId: string, archive: boolean) {
  if (!warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED)) {
    return { error: 'Catalogue archiving is not enabled yet.' }
  }
  const profile = await getCurrentProfile()
  if (!(await managerOperationAllowed(profile,'maintain_catalogue'))) {
    return { error: 'Catalogue permission required' }
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

  if (!(await managerOperationAllowed(profile,'maintain_catalogue'))) {
    return { error: 'Catalogue permission required' }
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
    throw new Error('Manager access required')
  }

  const session = await createSessionClient()
  const db = createServerClient()
  const [{data: profiles,error: profilesError},{data: vans,error: vansError}] = await Promise.all([
    session.rpc('vanstock_company_staff'),
    db.from('vans').select('*').eq('company_id',profile.company_id).order('van_number'),
  ])
  if(profilesError){
    console.error('User directory load failed',{code:profilesError.code,message:profilesError.message})
    throw new Error('Could not load staff accounts. Please retry or contact the administrator.')
  }
  if(vansError)throw new Error('Could not load service vans: '+vansError.message)
  if(!Array.isArray(profiles))throw new Error('Unexpected staff directory response')
  return {vans:vans??[],profiles}
}

type VehicleInput = {van_number:string;registration:string;make:string;model:string;colour:string;fuel_type:string}
export async function getWarehouseStockStandards(){
  const actor=await getCurrentProfile()
  if(!['admin','manager'].includes(actor.role)&&!(await accessFor(actor)).office_access)
    throw new Error('Office access required')
  const db=createServerClient()
  const {data,error}=await db.from('warehouse_stock_standards')
    .select('warehouse_id,product_id,min_quantity,target_quantity').eq('company_id',actor.company_id)
  if(error)throw new Error('Could not load warehouse stock thresholds: '+error.message)
  return data??[]
}
export async function saveWarehouseStockStandard(warehouseId:string,productId:string,minimum:number,target:number){
  const actor=await getCurrentProfile()
  if(!['admin','manager'].includes(actor.role))return {error:'Manager access required'}
  if(!Number.isFinite(minimum)||!Number.isFinite(target)||minimum<0||target<minimum||target>=1000000000||
    Math.abs(minimum*100-Math.round(minimum*100))>1e-7||Math.abs(target*100-Math.round(target*100))>1e-7)
    return {error:'Enter a valid warehouse minimum and target.'}
  const session=await createSessionClient()
  const [warehouse,product]=await Promise.all([
    session.from('warehouses').select('id').eq('company_id',actor.company_id).eq('id',warehouseId).maybeSingle(),
    session.from('products').select('stock_unit,archived_at').eq('company_id',actor.company_id).eq('id',productId).maybeSingle(),
  ])
  if(warehouse.error||product.error||!warehouse.data||!product.data||product.data.archived_at)
    return {error:'Select an active product and a valid warehouse.'}
  if(!['kg','m'].includes(product.data.stock_unit??'ea')&&(!Number.isSafeInteger(minimum)||!Number.isSafeInteger(target)))
    return {error:'Counted stock requires whole-number thresholds.'}
  const {error}=await session.from('warehouse_stock_standards').upsert({
    company_id:actor.company_id,warehouse_id:warehouseId,product_id:productId,
    min_quantity:minimum,target_quantity:target,updated_at:new Date().toISOString(),
  },{onConflict:'warehouse_id,product_id'})
  if(error)return {error:error.message}
  revalidatePath('/admin');revalidatePath('/warehouse')
  return {success:true}
}
const vehicleFuels=['diesel','petrol','hybrid','electric','lpg','other']
export async function saveVehicle(id:string|null,input:VehicleInput):Promise<{error?:string;success?:true}> {
  const actor=await getCurrentProfile()
  if(!(await managerOperationAllowed(actor,'maintain_vehicles')))return {error:'Vehicle register permission required.'}
  if(!input||typeof input!=='object')return {error:'Invalid vehicle details.'}
  const fields=['van_number','registration','make','model','colour','fuel_type'] as const
  if(fields.some(f=>typeof input[f]!=='string'))return {error:'Invalid vehicle details.'}
  const van_number=input.van_number.trim(),registration=input.registration.trim().toUpperCase()
  const make=input.make.trim(),model=input.model.trim(),colour=input.colour.trim(),fuel_type=input.fuel_type
  if(!van_number||van_number.length>40||registration.length>20||make.length>80||model.length>80||colour.length>40||
    (fuel_type&&!vehicleFuels.includes(fuel_type)))return {error:'Check vehicle name, registration and other fields.'}
  const db=createServerClient()
  const values={van_number,registration:registration||null,make:make||null,model:model||null,colour:colour||null,fuel_type:fuel_type||null}
  if(id){
    const {data,error}=await db.from('vans').update(values).eq('id',id).eq('company_id',actor.company_id).select('id').maybeSingle()
    if(error)return {error:error.code==='23505'?'Van number or registration already exists.':error.message}
    if(!data)return {error:'Vehicle not found in your company.'}
  }else{
    const {error}=await db.from('vans').insert({...values,company_id:actor.company_id})
    if(error)return {error:error.code==='23505'?'Van number or registration already exists.':error.message}
  }
  revalidatePath('/admin');return {success:true}
}

// Deactivation is reversible; identifiers and historical movements are never deleted.
export async function deactivateVehicle(id:string):Promise<{error?:string;success?:true}>{
  const actor=await getCurrentProfile()
  if(!(await managerOperationAllowed(actor,'maintain_vehicles')))return {error:'Vehicle register permission required.'}
  const db=createServerClient()
  const {data:van,error:vanError}=await db.from('vans').select('id,active').eq('id',id).eq('company_id',actor.company_id).maybeSingle()
  if(vanError||!van)return {error:'Vehicle not found.'}
  if(!van.active)return {success:true}
  const [stock,profiles,assignments,requests]=await Promise.all([
    db.from('stock').select('id').eq('van_id',id).neq('quantity',0).limit(1),
    db.from('profiles').select('id').eq('van_id',id).limit(1),
    db.from('user_authorized_vans').select('user_id').eq('van_id',id).limit(1),
    db.from('warehouse_replenishment_requests').select('id').eq('van_id',id).in('status',['pending','approved','issued']).limit(1),
  ])
  if(stock.error||profiles.error||assignments.error||requests.error)return {error:'Could not verify stock, requests and assignments. No changes made.'}
  if(stock.data?.length||profiles.data?.length||assignments.data?.length||requests.data?.length)
    return {error:'Clear remaining stock, pending replenishments and default/authorised user assignments before deactivating this van.'}
  const {error}=await db.from('vans').update({active:false}).eq('id',id).eq('company_id',actor.company_id)
  if(error)return {error:error.message}
  revalidatePath('/admin');return {success:true}
}
export async function reactivateVehicle(id:string):Promise<{error?:string;success?:true}>{
  const actor=await getCurrentProfile()
  if(!(await managerOperationAllowed(actor,'maintain_vehicles')))return {error:'Vehicle register permission required.'}
  const db=createServerClient()
  const {data,error}=await db.from('vans').update({active:true}).eq('id',id).eq('company_id',actor.company_id).select('id').maybeSingle()
  if(error)return {error:error.message}
  if(!data)return {error:'Vehicle not found.'}
  revalidatePath('/admin');return {success:true}
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
    const manager_operations = profile.role === 'admin'
      ? {maintain_catalogue:true,maintain_vehicles:true}
      : profile.role === 'manager'
        ? {maintain_catalogue:await managerOperationAllowed(profile,'maintain_catalogue'),maintain_vehicles:await managerOperationAllowed(profile,'maintain_vehicles')}
        : {maintain_catalogue:false,maintain_vehicles:false}
    return {
      full_name: profile.full_name,
      role: profile.role,
      access: await accessFor(profile),
      manager_operations,
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

// Administrator-managed Manager operation grants. This register is separate
// from technician warehouse permissions and does not itself bypass existing
// database movement checks.
export async function getManagerOperationPermissions(){
 const profile=await getCurrentProfile()
 if(profile.role!=='admin')return []
 const db=createServerClient()
 const {data,error}=await db.from('manager_operation_permissions')
  .select('user_id,approve_requests,issue_warehouse,receive_returns,adjust_stock,maintain_catalogue,maintain_vehicles')
  .eq('company_id',profile.company_id)
 if(error)throw new Error('Could not load Manager permissions: '+error.message)
 return data??[]
}

export async function saveManagerOperationPermissions(userId:string,grants:{approve_requests:boolean;issue_warehouse:boolean;receive_returns:boolean;adjust_stock:boolean;maintain_catalogue:boolean;maintain_vehicles:boolean}){
 const actor=await getCurrentProfile()
 if(actor.role!=='admin')return {error:'Administrator authorisation required'}
 if(!userId||Object.values(grants).length!==6||Object.values(grants).some(v=>typeof v!=='boolean'))return {error:'Invalid Manager permission settings'}
 const session=await createSessionClient()
 const {error}=await session.rpc('set_manager_operation_permissions',{
  p_user_id:userId,p_approve_requests:grants.approve_requests,p_issue_warehouse:grants.issue_warehouse,
  p_receive_returns:grants.receive_returns,p_adjust_stock:grants.adjust_stock,
  p_maintain_catalogue:grants.maintain_catalogue,p_maintain_vehicles:grants.maintain_vehicles,
 })
 if(error)return {error:error.message}
 revalidatePath('/admin')
 return {success:true}
}

// Server-selected, company-scoped warehouse permissions. Administrators and
// managers manage the request queue; technicians require an explicit grant.
export async function getMyWarehouseRights() {
  const profile = await getCurrentProfile()
  const admin = profile.role === 'admin'
  const db = createServerClient()
  const managerGrants = profile.role === 'manager'
    ? await db.from('manager_operation_permissions')
        .select('approve_requests,issue_warehouse,receive_returns,adjust_stock')
        .eq('company_id',profile.company_id).eq('user_id',profile.id).maybeSingle()
    : null
  if (managerGrants?.error) throw new Error('Could not check Manager permissions: '+managerGrants.error.message)
  const grants = managerGrants?.data
  const {data,error} = await db.from('user_warehouse_permissions')
    .select('can_request,can_issue,can_receive,can_adjust,can_stocktake')
    .eq('company_id',profile.company_id).eq('user_id',profile.id).maybeSingle()
  if (error) throw new Error('Could not check warehouse permissions: '+error.message)
  return {
    canRequest: admin || profile.role === 'manager' || Boolean(data?.can_request),
    canIssue: admin || Boolean(grants?.issue_warehouse) || (profile.role==='technician' && Boolean(data?.can_issue)),
    canReceive: admin || Boolean(grants?.receive_returns) || (profile.role==='technician' && Boolean(data?.can_receive)),
    // Physical count reconciliation remains management-only until the
    // independent technician stocktake workflow is designed and tested.
    canAdjust: admin || Boolean(grants?.adjust_stock),
    canStocktake: admin || Boolean(grants?.adjust_stock),
    canApproveRequests: admin || Boolean(grants?.approve_requests),
    canIssueRequests: admin || Boolean(grants?.issue_warehouse),
    canReceiveRequests: admin || Boolean(grants?.receive_returns),
    canManageRequests: admin || Boolean(grants?.approve_requests) || Boolean(grants?.issue_warehouse),
  }
}

export async function getWarehouseRequests() {
  const profile = await getCurrentProfile()
  const rights = await getMyWarehouseRights()
  const db = createServerClient()
  const columns='id,warehouse_id,van_id,product_id,quantity,reference,status,requested_by,reviewed_by,fulfilled_by,issued_by,received_by,created_at,reviewed_at,issued_at,received_at,fulfilled_at'
  const base=()=>db.from('warehouse_replenishment_requests').select(columns)
    .eq('company_id',profile.company_id).order('created_at',{ascending:false}).limit(100)
  const canViewAll=rights.canManageRequests||rights.canReceiveRequests
  const working=canViewAll?null:await getWorkingVans()
  if (!rights.canRequest && !canViewAll && !working?.vans.length) return []
  const own=canViewAll?await base():await base().eq('requested_by',profile.id)
  const inbound=working?.vans.length?await base().eq('status','issued').in('van_id',working.vans.map(v=>v.id)):null
  const error=own.error??inbound?.error
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw new Error('Could not load warehouse requests: '+error.message)
  }
  const data=[...new Map([...(own.data??[]),...(inbound?.data??[])].map(row=>[row.id,row])).values()]
    .sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100)
  if (!data?.length) return []
  const {data:discrepancies,error:discrepancyError}=await db.from('warehouse_receipt_discrepancies')
    .select('request_id,observed_quantity,reason,reported_at,resolved_at,resolution_note')
    .eq('company_id',profile.company_id).in('request_id',data.map(r=>r.id))
  if(discrepancyError)throw new Error('Could not load receiving exceptions: '+discrepancyError.message)
  const discrepancyByRequest=new Map((discrepancies??[]).map(d=>[d.request_id,d]))
  const {data:staff,error:staffError}=await db.from('profiles')
    .select('id,full_name,initials').eq('company_id',profile.company_id)
  if (staffError) throw new Error('Could not load request audit names: '+staffError.message)
  const names=new Map((staff??[]).map(s=>[s.id,{name:s.full_name,initials:s.initials}]))
  const label=(id:string|null)=>{
    const person=id?names.get(id):null
    return person?.name ? `${person.name}${person.initials?` (${person.initials})`:''}` : '—'
  }
  return data.map(row=>({
    ...row,
    discrepancy:discrepancyByRequest.get(row.id)??null,
    requested_by_label:label(row.requested_by),
    reviewed_by_label:label(row.reviewed_by),
    fulfilled_by_label:label(row.fulfilled_by),
    issued_by_label:label(row.issued_by),
    received_by_label:label(row.received_by),
  }))
}

export async function reportWarehouseReceiptDiscrepancy(id:string,observedQuantity:number,reason:string){
 if(!id||!Number.isFinite(observedQuantity)||observedQuantity<0||typeof reason!=='string'||reason.trim().length<5)
  return {error:'Enter the quantity actually received and explain the discrepancy.'}
 const session=await createSessionClient()
 const {error}=await session.rpc('report_warehouse_receipt_discrepancy',{
  p_request_id:id,p_observed_quantity:observedQuantity,p_reason:reason.trim()})
 if(error)return {error:error.message}
 revalidatePath('/warehouse');revalidatePath('/stock');revalidatePath('/actions')
 return {success:true}
}

export async function resolveWarehouseReceiptDiscrepancy(id:string,note:string){
 const rights=await getMyWarehouseRights()
 if(!rights.canIssueRequests)return {error:'Warehouse issue permission required.'}
 if(!id||typeof note!=='string'||note.trim().length<5)return {error:'Explain how the discrepancy was reconciled.'}
 const session=await createSessionClient()
 const {error}=await session.rpc('resolve_warehouse_receipt_discrepancy',{
  p_request_id:id,p_resolution_note:note.trim()})
 if(error)return {error:error.message}
 revalidatePath('/warehouse');revalidatePath('/stock');revalidatePath('/actions')
 return {success:true}
}

// Private notification inbox: identity and company are always taken from the
// verified session profile, never from a browser-supplied user identifier.
export async function getMyWarehouseNotifications() {
  const profile=await getCurrentProfile()
  const db=createServerClient()
  const {data,error}=await db.from('warehouse_notifications')
    .select('id,request_id,event_type,created_at,read_at,dismissed_at')
    .eq('company_id',profile.company_id).eq('user_id',profile.id)
    .order('created_at',{ascending:false}).limit(100)
  if(error){
    if(error.code==='42P01'||error.code==='PGRST205')return []
    throw new Error('Could not load notifications')
  }
  if(!data?.length)return []
  const ids=[...new Set(data.map(n=>n.request_id))]
  const {data:requests,error:requestError}=await db.from('warehouse_replenishment_requests')
    .select('id,reference,quantity,status,van_id,product_id')
    .eq('company_id',profile.company_id).in('id',ids)
  if(requestError)throw new Error('Could not load notification details')
  const details=new Map((requests??[]).map(r=>[r.id,r]))
  return data.filter(n=>details.has(n.request_id)).map(n=>({
    ...n,reference:details.get(n.request_id)?.reference??'Warehouse request',
    status:details.get(n.request_id)?.status??'',
  }))
}

export async function markWarehouseNotificationRead(id:string){
  if(!id)return {error:'Missing notification'}
  const session=await createSessionClient()
  const {data,error}=await session.rpc('vanstock_mark_warehouse_notification_read',{p_id:id})
  if(error||!data)return {error:'Notification could not be marked as read'}
  revalidatePath('/dashboard')
  revalidatePath('/warehouse')
  return {success:true}
}

export async function dismissWarehouseNotification(id:string){
 if(!id)return {error:'Missing notification'}
 const session=await createSessionClient()
 const {data,error}=await session.rpc('vanstock_dismiss_warehouse_notification',{p_id:id})
 if(error||!data)return {error:'Could not dismiss this notification'}
 revalidatePath('/dashboard');revalidatePath('/warehouse');revalidatePath('/stock');revalidatePath('/actions')
 return {success:true}
}

export async function clearReadWarehouseNotifications(){
 const session=await createSessionClient()
 const {data,error}=await session.rpc('vanstock_clear_read_warehouse_notifications')
 if(error)return {error:'Could not clear read notifications'}
 revalidatePath('/dashboard');revalidatePath('/warehouse');revalidatePath('/stock');revalidatePath('/actions')
 return {success:true,count:Number(data??0)}
}

export async function getWarehouseRequestLocations() {
  const rights=await getMyWarehouseRights()
  if (!rights.canRequest && !(await getWorkingVans()).vans.length) return []
  const profile=await getCurrentProfile()
  const db=createServerClient()
  const {data,error}=await db.from('warehouses').select('id,name')
    .eq('company_id',profile.company_id).order('name')
  if(error){
    if(error.code==='42P01'||error.code==='PGRST205')return []
    throw new Error('Could not load warehouse locations: '+error.message)
  }
  return data??[]
}

// Read-only availability shown before requesting or issuing replenishment.
// Stock remains authoritative in the database when an issue is confirmed.
export async function getWarehouseRequestBalances() {
  const rights=await getMyWarehouseRights()
  if (!rights.canRequest && !rights.canManageRequests && !(await getWorkingVans()).vans.length) return []
  const profile=await getCurrentProfile()
  const db=createServerClient()
  const {data:locations,error:locationError}=await db.from('warehouses').select('id').eq('company_id',profile.company_id)
  if(locationError)throw new Error('Could not read warehouse locations')
  if(!locations?.length)return []
  const {data,error}=await db.from('warehouse_stock')
    .select('warehouse_id,product_id,quantity')
    .in('warehouse_id',locations.map(w=>w.id))
  if(error)throw new Error('Could not read warehouse stock availability: '+error.message)
  return data??[]
}

export async function getWarehouseRequestPackages() {
  const rights=await getMyWarehouseRights()
  if(!rights.canRequest)return []
  const profile=await getCurrentProfile()
  const db=createServerClient()
  const {data,error}=await db.from('supplier_product_options')
    .select('id,product_id,package_label,purchase_unit,units_per_package')
    .eq('company_id',profile.company_id).eq('active',true)
  if(error)throw new Error('Could not load stock packaging options')
  return data??[]
}

export async function getWarehouseOperationLocations() {
  const rights=await getMyWarehouseRights()
  if (!rights.canIssue && !rights.canReceive) return []
  const profile=await getCurrentProfile()
  const db=createServerClient()
  const {data,error}=await db.from('warehouses').select('id,name')
    .eq('company_id',profile.company_id).order('name')
  if (error) throw new Error('Could not load warehouse locations: '+error.message)
  return data??[]
}

export async function requestWarehouseReplenishment(
  warehouseId:string,vanId:string,productId:string,quantity:number,reference:string,
) {
  const rights = await getMyWarehouseRights()
  if (!rights.canRequest) return {error:'Request replenishment permission required.'}
  const actor=await getCurrentProfile()
  const capabilities=await accessFor(actor)
  if (!rights.canManageRequests && !capabilities.office_access) {
    const working=await getWorkingVans()
    if (working.selectedId !== vanId)
      return {error:'You may only request stock for your selected authorised working van.'}
  }
  if (!warehouseId || !vanId || !productId || !reference?.trim() ||
      !Number.isFinite(quantity) || quantity <= 0 || quantity >= 1000000000 ||
      Math.abs(quantity*100-Math.round(quantity*100)) > 1e-7) {
    return {error:'Enter a valid quantity and reference.'}
  }
  const session=await createSessionClient()
  const {error}=await session.rpc('create_warehouse_replenishment_request',{
    p_warehouse_id:warehouseId,p_van_id:vanId,p_product_id:productId,
    p_quantity:quantity,p_reference:reference.trim(),
  })
  if(error)return {error:error.message}
  revalidatePath('/stock');revalidatePath('/warehouse')
  return {success:true}
}

export async function processWarehouseRequest(id:string,action:'approve'|'reject'|'fulfil') {
  if (!warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED) && action==='fulfil') {
    return {error:'Warehouse stock movements are disabled.'}
  }
  const rights=await getMyWarehouseRights()
  if (action==='fulfil' ? !rights.canIssueRequests : !rights.canApproveRequests)
    return {error:'Permission required for this warehouse action.'}
  if (!id || !['approve','reject','fulfil'].includes(action)) return {error:'Invalid request action.'}
  const session=await createSessionClient()
  const {error}=await session.rpc('process_warehouse_replenishment_request',{
    p_request_id:id,p_action:action,
  })
  if(error)return {error:error.message}
  for(const path of ['/warehouse','/stock','/dashboard','/logs'])revalidatePath(path)
  return {success:true}
}

export async function confirmWarehouseReceipt(id:string) {
  if (!warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED))
    return {error:'Warehouse stock movements are disabled.'}
  if (!id) return {error:'Missing warehouse request.'}
  const session=await createSessionClient()
  const {error}=await session.rpc('confirm_warehouse_replenishment_receipt',{p_request_id:id})
  if(error)return {error:error.message}
  for(const path of ['/warehouse','/stock','/dashboard','/logs','/fleet'])revalidatePath(path)
  return {success:true}
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
  if (!(await accessFor(profile)).office_access) {
    throw new Error('Office access required')
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
// Warehouse writes are disabled unless WAREHOUSE_WRITES_ENABLED=true.
export async function postWarehouseOpeningStock(
  warehouseId: string, productId: string, quantity: number, stocktakeReference: string,
) {
  if (!warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED)) {
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
  const { error } = await session.rpc('vanstock_warehouse_opening_stock', {
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
  _warehouseId: string, _vanId: string, _productId: string, _quantity: number,
  _reference: string,
) {
  // The legacy immediate issue endpoint must not bypass two-confirmation replenishment.
  return {error:'Use Warehouse replenishment requests. The receiving van must confirm stock before balances change.'}
}


// Warehouse returns and adjustments use database RPCs: both write a single audit event.
export async function returnVanStockToWarehouse(
  warehouseId: string, vanId: string, productId: string,
  quantity: number, reference: string,
) {
  if (!warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED)) return { error: 'Warehouse operations disabled.' }
  const profile = await getCurrentProfile()
  const rights = await getMyWarehouseRights()
  if (!rights.canReceive) return { error: 'Warehouse receive permission required.' }
  const capabilities=await accessFor(profile)
  if (!['admin','manager'].includes(profile.role) && !capabilities.office_access) {
    const working=await getWorkingVans()
    if(working.selectedId!==vanId)
      return {error:'Technicians may only return stock from their selected authorised working van.'}
  }
  if (!warehouseId || !vanId || !productId || !reference?.trim() || reference.length>450 ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-7) {
    return { error: 'Enter a valid return quantity (up to two decimal places) and reference.' }
  }
  const session = await createSessionClient()
  const { error } = await session.rpc('vanstock_warehouse_move', {
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
  if (!warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED)) return { error: 'Warehouse operations disabled.' }
  const profile = await getCurrentProfile()
  if (!['admin','manager'].includes(profile.role)) return { error: 'Manager access required.' }
  if (!warehouseId || !productId || !['add','remove','set'].includes(operation) ||
      !reference?.trim() || reference.length>450 || !Number.isFinite(quantity) || quantity < 0 ||
      (operation !== 'set' && quantity === 0) ||
      Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-7) {
    return { error: 'Enter a valid adjustment quantity and reference.' }
  }
  const session = await createSessionClient()
  const { error } = await session.rpc('vanstock_warehouse_adjust', {
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
  tracking_type?: 'stocked'|'bulk_consumable'|'cylinder'|'kit'|'reference_only'|'billing_only'
  servicem8_item_number?: string
  servicem8_material_uuid?: string
  supplier_name?: string
  supplier_part_number?: string
}

// One request, one database INSERT: either all validated products are created or none.
// Stock balances are deliberately excluded; the separate opening stocktake remains authoritative.
export async function importProductCatalogue(items: CatalogueImportItem[]) {
  const profile = await getCurrentProfile()
  if (!(await managerOperationAllowed(profile,'maintain_catalogue'))) return { error: 'Manager access required.' }
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    return { error: 'Import between 1 and 200 products at a time.' }
  }
  const allowedUnits = ['ea','kg','m','pack','container']
  const allowedTracking = ['stocked','bulk_consumable','cylinder','kit','reference_only','billing_only']
  const normalized = new Set<string>()
  for (const item of items) {
    if (typeof item?.name !== 'string' || !item.name.trim() ||
        item.name.trim().length > 200 || typeof item.category !== 'string' ||
        !item.category.trim() || item.category.trim().length > 100 ||
        !allowedUnits.includes(item.stock_unit) ||
        (item.tracking_type!==undefined && !allowedTracking.includes(item.tracking_type)) ||
        (item.servicem8_item_number!==undefined && (typeof item.servicem8_item_number!=='string'||item.servicem8_item_number.length>120)) ||
        (item.servicem8_material_uuid!==undefined && (typeof item.servicem8_material_uuid!=='string'||item.servicem8_material_uuid.length>120)) ||
        (item.supplier_name!==undefined && (typeof item.supplier_name!=='string'||item.supplier_name.length>120)) ||
        (item.supplier_part_number!==undefined && (typeof item.supplier_part_number!=='string'||item.supplier_part_number.length>120)) ||
        (item.supplier_part_number?.trim()&&!item.supplier_name?.trim()) ||
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
  const advanced=items.some(item=>item.tracking_type||item.servicem8_item_number||item.servicem8_material_uuid||item.supplier_name||item.supplier_part_number)
  if(advanced){
    const session=await createSessionClient()
    const {data,error}=await session.rpc('vanstock_import_catalogue_metadata',{p_items:items})
    if(error)return {error:'Extended import failed; no products should have been created. '+error.message}
    revalidatePath('/admin');revalidatePath('/warehouse')
    return {success:true,imported:Number(data)}
  }
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
  if (!(await managerOperationAllowed(profile,'maintain_catalogue'))) return { error: 'Manager access required.' }
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
 if(!(await managerOperationAllowed(p,'maintain_catalogue'))) throw new Error('Manager access required')
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
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
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
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
 const session=await createSessionClient()
 const {data:group,error:groupError}=await session.from('consumables_groups')
  .select('unit').eq('id',groupId).eq('company_id',p.company_id).maybeSingle()
 if(groupError)return {error:groupError.message}
 if(!group)return {error:'Consumables group not found or not authorised'}
 if(!Array.isArray(quantities)||!validQuickUseOptions(quantities,group.unit))
  return {error:'Enter four increasing positive quantities: whole numbers for counted items, up to two decimal places for metres and kilograms.'}
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
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))throw new Error('Manager access required')
 const db=createServerClient()
 const [suppliers,options,bins,vans,warehouses,hints]=await Promise.all([
   db.from('suppliers').select('id,name,account_number,active').eq('company_id',p.company_id).order('name'),
    db.from('supplier_product_options').select('id,product_id,supplier_id,supplier_code,package_label,purchase_unit,units_per_package,preferred,active').eq('company_id',p.company_id),
   db.from('product_bins').select('id,product_id,van_id,warehouse_id,bin_label').eq('company_id',p.company_id),
   db.from('vans').select('id,van_number').eq('company_id',p.company_id).eq('active',true).order('van_number'),
   db.from('warehouses').select('id,name').eq('company_id',p.company_id).order('name'),
   db.from('product_import_supplier_hints').select('product_id,supplier_name,supplier_part_number').eq('company_id',p.company_id),
 ])
 for(const r of [suppliers,options,bins,vans,warehouses,hints])if(r.error)throw new Error(r.error.message)
 return {suppliers:suppliers.data??[],options:options.data??[],bins:bins.data??[],vans:vans.data??[],warehouses:warehouses.data??[],hints:hints.data??[]}
}
export async function addCatalogueSupplier(name:string,accountNumber:string){
 const p=await getCurrentProfile()
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
 if(typeof name!=='string'||!name.trim()||name.trim().length>120||typeof accountNumber!=='string'||accountNumber.length>100)return {error:'Invalid supplier details'}
 const session=await createSessionClient()
 const {error}=await session.from('suppliers').insert({company_id:p.company_id,name:name.trim(),account_number:accountNumber.trim()||null})
 if(error)return {error:error.code==='23505'?'Supplier already exists':error.message}
 revalidatePath('/admin')
 return {success:true}
}
export async function updateCatalogueSupplier(id:string,name:string,accountNumber:string,active:boolean){
 const p=await getCurrentProfile()
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
 if(!id||typeof name!=='string'||!name.trim()||name.trim().length>120||typeof accountNumber!=='string'||accountNumber.length>100||typeof active!=='boolean')return {error:'Invalid supplier details'}
 const session=await createSessionClient()
 const {data,error}=await session.from('suppliers').update({name:name.trim(),account_number:accountNumber.trim()||null,active})
  .eq('id',id).eq('company_id',p.company_id).select('id')
 if(error)return {error:error.code==='23505'?'Supplier name already exists':error.message}
 if(!data?.length)return {error:'Supplier not found or not authorised'}
 revalidatePath('/admin');revalidatePath('/receive')
 return {success:true}
}
export async function addSupplierPackage(productId:string,supplierId:string,supplierCode:string,packageLabel:string,purchaseUnit:string,unitsPerPackage:number){
 const p=await getCurrentProfile()
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
 if(!productId||!supplierId||typeof supplierCode!=='string'||supplierCode.length>120||
 typeof packageLabel!=='string'||!packageLabel.trim()||packageLabel.trim().length>100||
 !['ea','kg','m','pack','container','roll','box','cylinder'].includes(purchaseUnit)||
 !Number.isFinite(unitsPerPackage)||unitsPerPackage<=0||unitsPerPackage>=1000000000||
 Math.abs(unitsPerPackage*100-Math.round(unitsPerPackage*100))>1e-7)
 return {error:'Invalid supplier package. Use a positive quantity with at most two decimals.'}
 const db=createServerClient()
 const {data:product,error:productError}=await db.from('products')
  .select('stock_unit').eq('id',productId).eq('company_id',p.company_id).maybeSingle()
 if(productError||!product)return {error:'Product not found in your company'}
 if(!isValidPackageConversion(unitsPerPackage,product.stock_unit))
  return {error:'Invalid conversion: individually counted stock requires whole-number units per package.'}
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
export async function setSupplierPackageActive(optionId:string,active:boolean){
 const p=await getCurrentProfile()
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
 if(!optionId||typeof active!=='boolean')return {error:'Invalid package selection'}
 const session=await createSessionClient()
 const {data,error}=await session.from('supplier_product_options')
  .update({active}).eq('id',optionId).eq('company_id',p.company_id).select('id')
 if(error)return {error:error.message}
 if(!data?.length)return {error:'Purchase option not found or not authorised'}
 revalidatePath('/admin');revalidatePath('/receive')
 return {success:true}
}
export async function updateSupplierPackage(optionId:string,supplierCode:string,packageLabel:string,purchaseUnit:string,unitsPerPackage:number){
 const p=await getCurrentProfile()
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
 if(!optionId||typeof supplierCode!=='string'||supplierCode.length>120||typeof packageLabel!=='string'||!packageLabel.trim()||packageLabel.trim().length>100||
 !['ea','kg','m','pack','container','roll','box','cylinder'].includes(purchaseUnit)||!Number.isFinite(unitsPerPackage)||unitsPerPackage<=0||unitsPerPackage>=1000000000||
 Math.abs(unitsPerPackage*100-Math.round(unitsPerPackage*100))>1e-7)return {error:'Invalid purchase package details'}
 const db=createServerClient()
 const {data:option,error:optionError}=await db.from('supplier_product_options').select('product_id').eq('id',optionId).eq('company_id',p.company_id).maybeSingle()
 if(optionError||!option)return {error:'Purchase option not found'}
 const {data:product,error:productError}=await db.from('products').select('stock_unit').eq('id',option.product_id).eq('company_id',p.company_id).maybeSingle()
 if(productError||!product||!isValidPackageConversion(unitsPerPackage,product.stock_unit))return {error:'Invalid conversion for stock tracking unit'}
 const session=await createSessionClient()
 const {data,error}=await session.from('supplier_product_options').update({supplier_code:supplierCode.trim()||null,package_label:packageLabel.trim(),purchase_unit:purchaseUnit,units_per_package:unitsPerPackage})
  .eq('id',optionId).eq('company_id',p.company_id).select('id')
 if(error)return {error:error.code==='23505'?'This supplier package already exists':error.message}
 if(!data?.length)return {error:'Purchase option not found or not authorised'}
 revalidatePath('/admin');revalidatePath('/receive')
 return {success:true}
}
export async function deleteUnusedSupplierRecord(kind:'supplier'|'package',id:string){
 const p=await getCurrentProfile()
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
 if(!['supplier','package'].includes(kind)||!id)return {error:'Invalid selection'}
 const session=await createSessionClient()
 const {data,error}=await session.rpc('vanstock_delete_unused_supplier_record',{p_kind:kind,p_id:id})
 if(error)return {error:error.message}
 if(!data)return {error:'Record was not deleted'}
 revalidatePath('/admin');revalidatePath('/receive')
 return {success:true}
}
export async function saveProductBin(productId:string,locationType:'van'|'warehouse',locationId:string,binLabel:string){
 const p=await getCurrentProfile()
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
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
 if(!(await managerOperationAllowed(p,'maintain_catalogue'))) throw new Error('Manager access required')
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
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
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
   session.from('vans').select('id').eq('id',vanId).eq('company_id',p.company_id).eq('active',true).maybeSingle(),
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
 if(!(await managerOperationAllowed(p,'maintain_catalogue'))) throw new Error('Manager access required')
 const db=createServerClient()
 const {data:vans,error:vanError}=await db.from('vans').select('id,van_number').eq('company_id',p.company_id).eq('active',true).order('van_number')
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
 if(!(await managerOperationAllowed(p,'maintain_catalogue')))return {error:'Manager access required'}
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
export async function issueEstimatedConsumable(productId:string,groupId:string,quantity:number,jobRef:string,selectedVanId?:string){
 const p=await getCurrentProfile()
 const working=await getWorkingVans(selectedVanId)
 if(!working.selectedId)return {error:'Choose an authorised working van'}
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
  p_reference:jobRef.trim(),p_notes:'Estimated consumables usage; no ServiceM8 charge posted.',p_selected_van_id:working.selectedId,
 })
 if(error)return {error:error.message}
 for(const path of ['/stock','/dashboard','/logs','/admin'])revalidatePath(path)
 return {success:true}
}


// ── PHASE 2B: ATOMIC PACK RECEIVING ──────────────────────
export async function receiveSupplierPack(
 receiptId:string,optionId:string,packs:number,docket:string,
 destinationType:'van'|'warehouse',destinationId:string,
){
 const p=await getCurrentProfile()
 if(!(await accessFor(p)).receive_stock)return {error:'Receiving access required'}
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptId)
 || !optionId||!destinationId||!['van','warehouse'].includes(destinationType)
 || !Number.isFinite(packs)||packs<=0||packs>=1000000000
 || Math.abs(packs*100-Math.round(packs*100))>1e-7
 || typeof docket!=='string'||!docket.trim()||docket.trim().length>120)
 return {error:'Check pack count, receipt reference and destination'}
 const session=await createSessionClient()
 const {data,error}=await session.rpc('receive_supplier_pack',{
  p_receipt_id:receiptId,p_option_id:optionId,p_packs:packs,
  p_docket:docket.trim(),p_destination_type:destinationType,p_destination_id:destinationId,
 })
 if(error)return {error:error.message}
 for(const path of ['/admin','/warehouse','/stock','/dashboard','/logs'])revalidatePath(path)
 return {success:true,quantity:Number(data)}
}


// ── PHASE 2C: RECEIVE LOOSE STOCK UNITS ────────────────
export async function receiveLooseItem(
 receiptId:string,productId:string,supplierId:string,quantity:number,docket:string,
 destinationType:'van'|'warehouse',destinationId:string
){
 const p=await getCurrentProfile()
 if(!(await accessFor(p)).receive_stock)return {error:'Receiving access required'}
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptId)
 || !productId||!supplierId||!destinationId||!['van','warehouse'].includes(destinationType)
 || !Number.isFinite(quantity)||quantity<=0||quantity>=1000000000
 || Math.abs(quantity*100-Math.round(quantity*100))>1e-7
 || typeof docket!=='string'||!docket.trim()||docket.trim().length>120)
 return {error:'Check quantity, supplier, docket and receiving destination'}
 const session=await createSessionClient()
 const {data,error}=await session.rpc('receive_loose_item',{
  p_receipt_id:receiptId,p_product_id:productId,p_supplier_id:supplierId,
  p_quantity:quantity,p_docket:docket.trim(),p_destination_type:destinationType,p_destination_id:destinationId
 })
 if(error)return {error:error.message}
 for(const path of ['/admin','/warehouse','/stock','/dashboard','/logs'])revalidatePath(path)
 return {success:true,quantity:Number(data)}
}


// ── RECEIVING: CURRENT BALANCE + RECENT RECEIPTS ──────
// Read-only manager view; company scope is derived from the session profile.
export async function getReceiveStockBalance(productId:string,destinationType:'van'|'warehouse',destinationId:string){
 const profile=await getCurrentProfile()
 const permissions=await accessFor(profile)
 if(!permissions.receive_stock)throw new Error('Receiving access required')
 if(!permissions.office_access){
  if(destinationType!=='van')throw new Error('Technician receiving is limited to authorised vans')
  const working=await getWorkingVans(destinationId)
  if(working.selectedId!==destinationId)throw new Error('Only an authorised working van is available')
 }
 if(!productId||!destinationId||!['van','warehouse'].includes(destinationType))throw new Error('Invalid stock location')
 const db=createServerClient()
 const [product,location]=await Promise.all([
  db.from('products').select('id').eq('company_id',profile.company_id).eq('id',productId).maybeSingle(),
  destinationType==='van'
   ?db.from('vans').select('id').eq('company_id',profile.company_id).eq('active',true).eq('id',destinationId).maybeSingle()
   :db.from('warehouses').select('id').eq('company_id',profile.company_id).eq('id',destinationId).maybeSingle(),
 ])
 if(product.error||location.error||!product.data||!location.data)throw new Error('Product or receiving location not found')
 const q=destinationType==='van'
  ?db.from('stock').select('quantity').eq('product_id',productId).eq('van_id',destinationId).maybeSingle()
  :db.from('warehouse_stock').select('quantity').eq('product_id',productId).eq('warehouse_id',destinationId).maybeSingle()
 const {data,error}=await q
 if(error)throw new Error(error.message)
 return Number(data?.quantity??0)
}

export async function getRecentStockReceipts(selectedVanId?:string){
 const profile=await getCurrentProfile()
 const permissions=await accessFor(profile)
 if(!permissions.receive_stock)throw new Error('Receiving access required')
 const working=permissions.office_access?null:await getWorkingVans(selectedVanId)
 if(!permissions.office_access&&!working?.selectedId)return []
 const viewVan=working?.selectedId??null
 const db=createServerClient()
 const [packs,loose,products,suppliers,locations,people]=await Promise.all([
   (permissions.office_access?db.from('pack_receipts').select('id,product_id,supplier_id,destination_type,van_id,warehouse_id,stock_quantity,docket,created_at,packs,units_per_package,received_by').eq('company_id',profile.company_id):db.from('pack_receipts').select('id,product_id,supplier_id,destination_type,van_id,warehouse_id,stock_quantity,docket,created_at,packs,units_per_package,received_by').eq('company_id',profile.company_id).eq('van_id',viewVan)).order('created_at',{ascending:false}).limit(15),
   (permissions.office_access?db.from('loose_item_receipts').select('id,product_id,supplier_id,destination_type,van_id,warehouse_id,quantity,docket,created_at,received_by').eq('company_id',profile.company_id):db.from('loose_item_receipts').select('id,product_id,supplier_id,destination_type,van_id,warehouse_id,quantity,docket,created_at,received_by').eq('company_id',profile.company_id).eq('van_id',viewVan)).order('created_at',{ascending:false}).limit(15),
  db.from('products').select('id,name,stock_unit').eq('company_id',profile.company_id),
  db.from('suppliers').select('id,name').eq('company_id',profile.company_id),
  Promise.all([db.from('vans').select('id,van_number').eq('company_id',profile.company_id).eq('active',true),db.from('warehouses').select('id,name').eq('company_id',profile.company_id)]),
  db.from('profiles').select('id,full_name,initials').eq('company_id',profile.company_id),
 ])
 const [vans,warehouses]=locations
 const error=packs.error||loose.error||products.error||suppliers.error||vans.error||warehouses.error||people.error
 if(error)throw new Error(error.message)
 const peopleMap=new Map((people.data??[]).map(p=>[p.id,{name:p.full_name,initials:p.initials}]))
 const productMap=new Map((products.data??[]).map(p=>[p.id,p]))
 const supplierMap=new Map((suppliers.data??[]).map(s=>[s.id,s.name]))
 const locationMap=new Map([
  ...(vans.data??[]).map(v=>[v.id,v.van_number] as const),
  ...(warehouses.data??[]).map(w=>[w.id,w.name] as const),
 ])
 return [
  ...(packs.data??[]).map(r=>({id:r.id,kind:'pack' as const,product:productMap.get(r.product_id)?.name??'Unknown product',
    unit:productMap.get(r.product_id)?.stock_unit??'ea',supplier:supplierMap.get(r.supplier_id)??'Unknown supplier',
    destination:locationMap.get(r.van_id??r.warehouse_id??'')??'Unknown location',
    quantity:Number(r.stock_quantity),docket:r.docket,created_at:r.created_at,processed_by:peopleMap.get(r.received_by??'')?.name??null,processor_initials:peopleMap.get(r.received_by??'')?.initials??null})),
  ...(loose.data??[]).map(r=>({id:r.id,kind:'loose' as const,product:productMap.get(r.product_id)?.name??'Unknown product',
    unit:productMap.get(r.product_id)?.stock_unit??'ea',supplier:supplierMap.get(r.supplier_id)??'Unknown supplier',
    destination:locationMap.get(r.van_id??r.warehouse_id??'')??'Unknown location',
    quantity:Number(r.quantity),docket:r.docket,created_at:r.created_at,processed_by:peopleMap.get(r.received_by??'')?.name??null,processor_initials:peopleMap.get(r.received_by??'')?.initials??null})),
 ].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,10)
}


// ── TRANSACTION HISTORY: OPERATIONS + SUPPLIER RECEIPTS ─────────────
// Both dates are interpreted as full local calendar days in Perth (UTC+08).
// All date and type filters execute in PostgreSQL before the result cap.
export async function getTransactionHistory(startDate?:string,endDate?:string,typeFilter?:string,selectedVanId?:string){
 const profile=await getCurrentProfile()
 const access=await accessFor(profile)
 const manager=access.office_access
 if(!access.office_access&&!access.technician_access)throw new Error('Not authorised')
 const working=manager?null:await getWorkingVans(selectedVanId)
 if(!manager&&!working?.selectedId)return {entries:[],capped:false}
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
 if(startDate&&!validDate(startDate))throw new Error('Invalid start date')
 if(endDate&&!validDate(endDate))throw new Error('Invalid end date')
 if(startDate&&endDate&&startDate>endDate)throw new Error('Start date must be on or before end date')
 const start=startDate?startDate+'T00:00:00+08:00':null
 const nextDay=endDate?new Date(Date.parse(endDate+'T00:00:00Z')+86400000).toISOString().slice(0,10)+'T00:00:00+08:00':null
 const db=createServerClient()
 const cap=500
 let a=db.from('activity_log').select('id,created_at,type,product_name,quantity,reference,notes,van_id,user_id').eq('company_id',profile.company_id)
 let b=db.from('pack_receipts').select('id,created_at,product_id,supplier_id,destination_type,van_id,warehouse_id,stock_quantity,docket,received_by').eq('company_id',profile.company_id)
 let c=db.from('loose_item_receipts').select('id,created_at,product_id,supplier_id,destination_type,van_id,warehouse_id,quantity,docket,received_by').eq('company_id',profile.company_id)
 if(!manager){a=a.eq('van_id',working!.selectedId);b=b.eq('van_id',working!.selectedId);c=c.eq('van_id',working!.selectedId)}
 if(start){a=a.gte('created_at',start);b=b.gte('created_at',start);c=c.gte('created_at',start)}
 if(nextDay){a=a.lt('created_at',nextDay);b=b.lt('created_at',nextDay);c=c.lt('created_at',nextDay)}
 const filter=typeFilter??'all'
 if(filter==='receipt-pack'){a=a.eq('type','__not_a_transaction_type__');c=c.eq('id','00000000-0000-0000-0000-000000000000')}
 else if(filter==='receipt-loose'){a=a.eq('type','__not_a_transaction_type__');b=b.eq('id','00000000-0000-0000-0000-000000000000')}
 else if(filter!=='all'){a=a.eq('type',filter);b=b.eq('id','00000000-0000-0000-0000-000000000000');c=c.eq('id','00000000-0000-0000-0000-000000000000')}
 const [activities,packs,loose,products,suppliers,people,vans,warehouses]=await Promise.all([
  a.order('created_at',{ascending:false}).limit(cap+1),
  b.order('created_at',{ascending:false}).limit(cap+1),
  c.order('created_at',{ascending:false}).limit(cap+1),
  db.from('products').select('id,name,stock_unit').eq('company_id',profile.company_id),
  db.from('suppliers').select('id,name').eq('company_id',profile.company_id),
  db.from('profiles').select('id,full_name,initials').eq('company_id',profile.company_id),
  db.from('vans').select('id,van_number').eq('company_id',profile.company_id).eq('active',true),
  db.from('warehouses').select('id,name').eq('company_id',profile.company_id),
 ])
 const error=activities.error||packs.error||loose.error||products.error||suppliers.error||people.error||vans.error||warehouses.error
 if(error)throw new Error(error.message)
 const pmap=new Map((products.data??[]).map(p=>[p.id,p]))
 const smap=new Map((suppliers.data??[]).map(s=>[s.id,s.name]))
 const umap=new Map((people.data??[]).map(p=>[p.id,{name:p.full_name,initials:p.initials}]))
 const locmap=new Map([
  ...(vans.data??[]).map(v=>[v.id,v.van_number] as const),
  ...(warehouses.data??[]).map(w=>[w.id,w.name] as const),
 ])
 const entries=[
  ...(activities.data??[]).map(r=>({id:'activity:'+r.id,date:r.created_at,type:r.type,product:r.product_name,quantity:Number(r.quantity),
   unit:null as string|null,location:locmap.get(r.van_id??'')??'—',reference:r.reference??'',processedBy:umap.get(r.user_id??'')?.name??null,processorInitials:umap.get(r.user_id??'')?.initials??null,notes:r.notes??''})),
  ...(packs.data??[]).map(r=>({id:'pack:'+r.id,date:r.created_at,type:'receipt-pack',product:pmap.get(r.product_id)?.name??'Unknown product',
   quantity:Number(r.stock_quantity),unit:pmap.get(r.product_id)?.stock_unit??'ea',
   location:locmap.get(r.van_id??r.warehouse_id??'')??'—',reference:r.docket,processedBy:umap.get(r.received_by??'')?.name??null,processorInitials:umap.get(r.received_by??'')?.initials??null,
   notes:'Supplier: '+(smap.get(r.supplier_id)??'Unknown supplier')})),
  ...(loose.data??[]).map(r=>({id:'loose:'+r.id,date:r.created_at,type:'receipt-loose',product:pmap.get(r.product_id)?.name??'Unknown product',
   quantity:Number(r.quantity),unit:pmap.get(r.product_id)?.stock_unit??'ea',
   location:locmap.get(r.van_id??r.warehouse_id??'')??'—',reference:r.docket,processedBy:umap.get(r.received_by??'')?.name??null,processorInitials:umap.get(r.received_by??'')?.initials??null,
   notes:'Supplier: '+(smap.get(r.supplier_id)??'Unknown supplier')})),
 ].sort((x,y)=>y.date.localeCompare(x.date))
 return {entries:entries.slice(0,cap),capped:entries.length>cap}
}


// ── STAFF IDENTITY ───────────────────────────────────────
export async function saveStaffInitials(userId:string,initials:string){
 const p=await getCurrentProfile()
 if(p.role!=='admin')return {error:'Administrator access required'}
 const value=initials.trim().toUpperCase()
 if(!/^[A-Z]{2,5}$/.test(value))return {error:'Use 2 to 5 letters for initials'}
 const db=createServerClient()
 const {data:target,error:targetError}=await db.from('profiles').select('id').eq('id',userId).eq('company_id',p.company_id).maybeSingle()
 if(targetError||!target)return {error:'User not found in your company'}
 const {error}=await db.from('profiles').update({initials:value}).eq('id',userId).eq('company_id',p.company_id)
 if(error)return {error:error.code==='23505'?'These initials are already used by another staff member':error.message}
 revalidatePath('/admin');revalidatePath('/logs');revalidatePath('/receive');revalidatePath('/transfer')
 return {success:true}
}


// Phase 3B: permission planning register. Existing stock mutation RPCs
// continue to enforce the original role/van restrictions until migrated.
export async function getUserAccessCapabilities(){
 const profile=await getCurrentProfile()
 if(!['admin','manager'].includes(profile.role))throw new Error('Manager access required')
 const db=createServerClient()
 const {data,error}=await db.from('user_access_capabilities')
  .select('user_id,office_access,technician_access,receive_stock,manage_catalogue,manage_users')
  .eq('company_id',profile.company_id)
 if(error)throw new Error(error.message)
 return data??[]
}
export async function saveUserAccessCapabilities(
 userId:string,perms:{office_access:boolean;technician_access:boolean;receive_stock:boolean;manage_catalogue:boolean}
){
 const profile=await getCurrentProfile()
 if(profile.role!=='admin')return {error:'Administrator access required'}
 if(!userId||Object.values(perms).some(v=>typeof v!=='boolean'))return {error:'Invalid permission settings'}
 const session=await createSessionClient()
 const {error}=await session.rpc('set_user_access_capabilities',{
  p_user_id:userId,p_office_access:perms.office_access,
  p_technician_access:perms.technician_access,p_receive_stock:perms.receive_stock,
  p_manage_catalogue:perms.manage_catalogue,
 })
 if(error)return {error:error.message}
 revalidatePath('/admin')
 return {success:true}
}

export async function getReceivingSetup(selectedVanId?:string){
 const p=await getCurrentProfile()
 if(!(await accessFor(p)).receive_stock)throw new Error('Receiving access required')
 const db=createServerClient()
 const [products,suppliers,options,vans,warehouses]=await Promise.all([
  db.from('products').select('id,name,stock_unit,archived_at').eq('company_id',p.company_id).is('archived_at',null).order('name'),
  db.from('suppliers').select('id,name,active').eq('company_id',p.company_id).eq('active',true).order('name'),
    db.from('supplier_product_options').select('id,product_id,supplier_id,package_label,purchase_unit,units_per_package').eq('company_id',p.company_id).eq('active',true),
  db.from('vans').select('id,van_number').eq('company_id',p.company_id).eq('active',true),
  db.from('warehouses').select('id,name').eq('company_id',p.company_id),
 ])
 for(const result of [products,suppliers,options,vans,warehouses])if(result.error)throw new Error(result.error.message)
 const cap=await accessFor(p)
 const working=cap.office_access?null:await getWorkingVans(selectedVanId)
 return {products:products.data??[],suppliers:suppliers.data??[],options:options.data??[],
   vans:cap.office_access?vans.data??[]:(vans.data??[]).filter(v=>v.id===working?.selectedId),
  warehouses:cap.office_access?warehouses.data??[]:[]}
}

export async function getUserAuthorizedVans(){
 const profile=await getCurrentProfile()
 if(profile.role!=='admin'&&profile.role!=='manager')throw new Error('Manager required')
 const db=createServerClient()
 const {data,error}=await db.from('user_authorized_vans').select('user_id,van_id').eq('company_id',profile.company_id)
 if(error)throw new Error(error.message)
 return data??[]
}
export async function saveUserVanAssignments(userId:string,vanIds:string[],defaultVanId:string|null){
 const profile=await getCurrentProfile()
 if(profile.role!=='admin')return {error:'Administrator required'}
 if(!userId||!Array.isArray(vanIds)||vanIds.some(id=>typeof id!=='string')||
   (defaultVanId!==null&&typeof defaultVanId!=='string'))return {error:'Invalid van selections'}
 const session=await createSessionClient()
 const {error}=await session.rpc('configure_user_vans',{p_user_id:userId,p_van_ids:vanIds,p_default_van:defaultVanId})
 if(error)return {error:error.message}
 revalidatePath('/admin');revalidatePath('/stock');revalidatePath('/transfer')
 return {success:true}
}

export async function saveUserStatusAndAdmin(userId:string,isActive:boolean,isAdmin:boolean){
 const profile=await getCurrentProfile()
 if(profile.role!=='admin')return {error:'Administrator required'}
 if(!userId||typeof isActive!=='boolean'||typeof isAdmin!=='boolean')return {error:'Invalid account settings'}
 const session=await createSessionClient()
 const {error}=await session.rpc('configure_user_status_and_admin',{p_user_id:userId,p_is_active:isActive,p_is_admin:isAdmin})
 if(error)return {error:error.message}
 revalidatePath('/admin');revalidatePath('/logs')
 return {success:true}
}


// ── STAFF INVITATIONS ──────────────────────────────────────────
// Only authenticated active administrators can initiate an invitation.
// The invitation email is sent by Supabase, never by a browser-held secret.
export async function inviteVanStockUser(details:{
 full_name:string;email:string;initials:string;
 is_active:boolean;technician:boolean;office:boolean;admin:boolean;
 van_ids:string[];default_van_id:string|null;
}):Promise<{success?:true;error?:string}>{
 const actor=await getCurrentProfile()
 if(actor.role!=='admin')return {error:'Administrator access required'}
 if(!details||typeof details!=='object')return {error:'Invalid invitation details'}
 const name=typeof details.full_name==='string'?details.full_name.trim().replace(/\s+/g,' '):''
 const email=typeof details.email==='string'?details.email.trim().toLowerCase():''
 const initials=typeof details.initials==='string'?details.initials.trim().toUpperCase():''
 if(name.length<3||name.length>120||!name.includes(' ')||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
    !(/^[A-Z]{2,5}$/.test(initials)))return {error:'Enter a full name, valid email and 2–5 letter initials'}
 if([details.is_active,details.technician,details.office,details.admin].some(v=>typeof v!=='boolean'))
  return {error:'Invalid access settings'}
 const ids=details.van_ids
 if(!Array.isArray(ids)||ids.length!==new Set(ids).size||ids.some(v=>typeof v!=='string'||!(/^[0-9a-f-]{36}$/i.test(v))))
  return {error:'Invalid authorised van selection'}
 if(details.default_van_id!==null&&
    (typeof details.default_van_id!=='string'||!ids.includes(details.default_van_id)))
  return {error:'The default van must be an authorised van'}
 if(!details.technician&&ids.length)return {error:'Tick Technician before assigning a van'}
 const db=createServerClient()
 const [{data:existingInitials,error:initialsError},{data:vans,error:vansError}]=await Promise.all([
  db.from('profiles').select('id').eq('company_id',actor.company_id).eq('initials',initials).limit(1),
  ids.length?db.from('vans').select('id').eq('company_id',actor.company_id).eq('active',true).in('id',ids):Promise.resolve({data:[],error:null}),
 ])
 if(initialsError||vansError)return {error:'Could not validate the invitation; please retry'}
 if(existingInitials?.length)return {error:'Initials already assigned to another user'}
 if((vans??[]).length!==ids.length)return {error:'An authorised van does not belong to your company'}

 // Supabase sends the email. Its redirect URL must be allowed in Auth settings.
 const {data:invited,error:inviteError}=await db.auth.admin.inviteUserByEmail(email,{
  redirectTo:'https://vanstock-alpha.vercel.app/auth/accept-invite',
  data:{full_name:name},
 })
 if(inviteError)return {error:'Invitation could not be sent: '+inviteError.message}
 if(!invited.user?.id)return {error:'Supabase did not return the invited account. Check Auth users before retrying.'}
 const session=await createSessionClient()
 const {error:setupError}=await session.rpc('vanstock_setup_invited_user',{
  p_user_id:invited.user.id,p_full_name:name,p_initials:initials,p_email:email,
  p_active:details.is_active,p_technician:details.technician,
  p_office:details.office,p_admin:details.admin,
  p_van_ids:ids,p_default_van:details.default_van_id,
 })
 if(setupError){
  console.error('Invited user profile setup failed',{code:setupError.code,message:setupError.message})
  return {error:'Invitation was issued, but user setup could not be completed. Do not send another invitation; contact the administrator to finish setup.'}
 }
 revalidatePath('/admin')
 return {success:true}
}


// Send a new password-setup email to an EXISTING VanStock staff account.
// Reuses the same Supabase Auth identity and preserves role, vans and audit.
export async function sendExistingUserSetupLink(userId:string):Promise<{success?:true;error?:string}>{
 const actor=await getCurrentProfile()
 if(actor.role!=='admin')return {error:'Administrator access required'}
 if(typeof userId!=='string'||!(/^[0-9a-f-]{36}$/i.test(userId)))
  return {error:'Invalid staff account'}
 if(userId===actor.id)return {error:'Use your personal password reset process for your own account'}
 const db=createServerClient()
 const {data:staff,error:staffError}=await db.from('profiles')
  .select('id,full_name,company_id,is_active').eq('id',userId).eq('company_id',actor.company_id).maybeSingle()
 if(staffError||!staff)return {error:'Staff member not found in your company'}
 if(!staff.is_active)return {error:'The account is disabled. Enable it before sending a setup link.'}
 const {data:identity,error:identityError}=await db.auth.admin.getUserById(userId)
 if(identityError||!identity.user?.email)return {error:'No email address is registered for this account'}
 const email=identity.user.email
 // Supabase emails a fresh one-time recovery link. It cannot alter the
 // password until the recipient follows the link and completes verification.
 const {error}=await db.auth.resetPasswordForEmail(email,{
  redirectTo:'https://vanstock-alpha.vercel.app/auth/accept-invite',
 })
 if(error)return {error:'Could not send setup email: '+error.message}
 return {success:true}
}
