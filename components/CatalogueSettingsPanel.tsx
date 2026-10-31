'use client'
import { useState, useTransition } from 'react'
import { saveCatalogueSettings, saveConsumablesGroup } from '@/lib/actions'

type Product = { id:string; name:string }
type Settings = { product_id:string; tracking_type:string; servicem8_material_uuid:string|null; servicem8_item_number:string|null; mapping_status:string }
type Group = { id:string; name:string; unit:string; quick_1:number;quick_2:number;quick_3:number;quick_4:number }
const trackingTypes = [
 ['stocked','Stocked product'],['bulk_consumable','Bulk consumable'],
 ['cylinder','Serialised cylinder'],['kit','Kit / assembly'],
 ['reference_only','Catalogue reference only'],['billing_only','Billing only'],
] as const

export default function CatalogueSettingsPanel({ products,settings,groups }:{
 products:Product[]; settings:Settings[]; groups:Group[]
}) {
 const [productId,setProductId]=useState(products[0]?.id??'')
 const current=settings.find(s=>s.product_id===productId)
 const [tracking,setTracking]=useState(current?.tracking_type??'stocked')
 const [mapping,setMapping]=useState(current?.mapping_status??'unlinked')
 const [sm8uuid,setSm8uuid]=useState(current?.servicem8_material_uuid??'')
 const [sm8code,setSm8code]=useState(current?.servicem8_item_number??'')
 const [groupId,setGroupId]=useState(groups[0]?.id??'')
 const [groupValues,setGroupValues]=useState<string[]>(groups.length? [groups[0].quick_1,groups[0].quick_2,groups[0].quick_3,groups[0].quick_4].map(String):[])
 const [productError,setProductError]=useState('')
 const [productMessage,setProductMessage]=useState('')
 const [groupError,setGroupError]=useState('')
 const [groupMessage,setGroupMessage]=useState('')
 const [busy,start]=useTransition()
 function chooseProduct(id:string) {
   const s=settings.find(x=>x.product_id===id)
   setProductId(id);setTracking(s?.tracking_type??'stocked')
   setMapping(s?.mapping_status??'unlinked')
   setSm8uuid(s?.servicem8_material_uuid??'');setSm8code(s?.servicem8_item_number??'')
   setProductError('');setProductMessage('');setGroupError('');setGroupMessage('')
 }
 function chooseGroup(id:string) {
   const g=groups.find(x=>x.id===id)
   setGroupId(id)
   if(g)setGroupValues([g.quick_1,g.quick_2,g.quick_3,g.quick_4].map(String))
   setProductError('');setProductMessage('');setGroupError('');setGroupMessage('')
 }
 function saveProduct(){
   if(!productId)return
   setProductError('');setProductMessage('');setGroupError('');setGroupMessage('')
   start(async()=>{
     const r=await saveCatalogueSettings(productId,tracking,mapping,sm8uuid,sm8code)
     if(r.error)setProductError(r.error);else setProductMessage('Product classification saved. Existing stock is unchanged.')
   })
 }
 function saveGroup(){
   const vals=groupValues.map(Number)
   if(vals.length!==4||vals.some(x=>!Number.isFinite(x)||x<=0)||vals.some((x,i)=>i>0&&x<=vals[i-1])){
     setGroupError('Enter four positive usage quantities in ascending order.');return
   }
   setProductError('');setProductMessage('');setGroupError('');setGroupMessage('')
   start(async()=>{
     const r=await saveConsumablesGroup(groupId,vals)
     if(r.error)setGroupError(r.error);else setGroupMessage('Consumables group updated.')
   })
 }
 return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
  <section className="card">
   <h2 className="text-sm font-medium mb-2">VanStock product classification</h2>
   <p className="text-xs text-gray-500 mb-3">Configure sample products independently of ServiceM8 inventory. No stock quantities are changed.</p>
   {products.length>0 ? <>
   <label className="form-label" htmlFor="settings-product">Product</label>
   <select className="form-input mb-3" id="settings-product" value={productId} onChange={e=>chooseProduct(e.target.value)}>
     {products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
   </select>
   <label className="form-label" htmlFor="tracking-type">VanStock tracking type</label>
   <select className="form-input mb-3" id="tracking-type" value={tracking} onChange={e=>setTracking(e.target.value)}>
     {trackingTypes.map(([val,label])=><option key={val} value={val}>{label}</option>)}
   </select>
   <label className="form-label" htmlFor="mapping-status">ServiceM8 mapping status</label>
   <select className="form-input mb-3" id="mapping-status" value={mapping} onChange={e=>setMapping(e.target.value)}>
     <option value="unlinked">Unlinked</option><option value="linked">Linked</option>
     <option value="needs_review">Needs review</option><option value="vanstock_only">VanStock only</option>
   </select>
   <label className="form-label" htmlFor="sm8-code">ServiceM8 item number (optional)</label>
   <input className="form-input mb-3" id="sm8-code" value={sm8code} onChange={e=>setSm8code(e.target.value)} maxLength={120}/>
   <label className="form-label" htmlFor="sm8-uuid">ServiceM8 material UUID (required when linked)</label>
   <input className="form-input mb-3" id="sm8-uuid" value={sm8uuid} onChange={e=>setSm8uuid(e.target.value)} maxLength={120}/>
   <p className="text-xs text-amber-700 mb-3">Enter only verified ServiceM8 references. No ServiceM8 connection is active.</p>
   <button className="btn btn-primary" type="button" disabled={busy} onClick={saveProduct}>{busy?'Saving…':'Save classification'}</button>
   </>:<p className="text-sm text-gray-500">No products available.</p>}
   {(productError||productMessage)&&<p role={productError?'alert':'status'} className={productError?'text-sm text-red-700 mt-3':'text-sm text-green-700 mt-3'}>{productError||productMessage}</p>}
  </section>
  <section className="card">
    <h2 className="text-sm font-medium mb-2">Consumables group quick-use presets</h2>
    <p className="text-xs text-gray-500 mb-3">Four options per group; changes affect configuration only, not existing stock.</p>
    {groups.length>0?<>
      <label className="form-label" htmlFor="consumables-group">Group</label>
      <select className="form-input mb-3" id="consumables-group" value={groupId} onChange={e=>chooseGroup(e.target.value)}>
       {groups.map(g=><option value={g.id} key={g.id}>{g.name} ({g.unit})</option>)}
      </select>
      <div className="grid grid-cols-4 gap-2 mb-3">
       {groupValues.map((val,i)=><div key={i}>
         <label className="form-label" htmlFor={'quick-'+i}>{i+1}</label>
         <input className="form-input" id={'quick-'+i} type="number" step="0.01" min="0.01" value={val}
           onChange={e=>setGroupValues(prev=>prev.map((x,j)=>j===i?e.target.value:x))}/>
       </div>)}
      </div>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={saveGroup}>{busy?'Saving…':'Save four options'}</button>
    </>:<p className="text-sm text-gray-500">No groups configured.</p>}
    {(groupError||groupMessage)&&<p role={groupError?'alert':'status'} className={groupError?'text-sm text-red-700 mt-3':'text-sm text-green-700 mt-3'}>{groupError||groupMessage}</p>}
  </section>
 </div>
}
