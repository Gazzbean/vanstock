'use client'
import {useState,useTransition} from 'react'
import {assignProductConsumablesGroup} from '@/lib/actions'

type Product={id:string;name:string;stock_unit:string|null;archived_at:string|null}
type Group={id:string;name:string;unit:string;quick_1:number;quick_2:number;quick_3:number;quick_4:number}
type Assignment={product_id:string;group_id:string}
export default function ConsumablesAssignmentsPanel({products,groups,assignments}:{
 products:Product[];groups:Group[];assignments:Assignment[]
}){
 const active=products.filter(p=>!p.archived_at)
 const [productId,setProductId]=useState(active[0]?.id??'')
 const [mapped,setMapped]=useState(assignments)
 const assigned=mapped.find(x=>x.product_id===productId)?.group_id??''
 const [groupId,setGroupId]=useState(assigned)
 const [pending,start]=useTransition()
 const [result,setResult]=useState('')
 const product=active.find(p=>p.id===productId)
 const available=groups.filter(g=>g.unit===(product?.stock_unit??'ea'))
 const selected=groups.find(g=>g.id===groupId)
 function pick(id:string){setProductId(id);setGroupId(mapped.find(x=>x.product_id===id)?.group_id??'');setResult('')}
 function save(){
  setResult('')
  start(async()=>{
   try{const r=await assignProductConsumablesGroup(productId,groupId)
    if(r.error){setResult(r.error);return}
    setMapped(rows=>[...rows.filter(x=>x.product_id!==productId),{product_id:productId,group_id:groupId}])
    setResult('Consumables group assigned. No stock was changed.')
   }catch{setResult('Update could not be confirmed. Refresh before retrying.')}
  })
 }
 return <section className="card mt-4">
  <h2 className="text-sm font-medium mb-2">Consumables product groups</h2>
  <p className="text-xs text-gray-500 mb-3">Assign a product to one of the four-button usage groups. Only matching stock units are available.</p>
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
   <div><label htmlFor="consume-assign-product" className="form-label">Product</label>
    <select id="consume-assign-product" className="form-input" value={productId} onChange={e=>pick(e.target.value)}>
     {active.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select></div>
   <div><label htmlFor="consume-assign-group" className="form-label">Consumables group</label>
    <select id="consume-assign-group" className="form-input" value={groupId} onChange={e=>{setGroupId(e.target.value);setResult('')}}>
     <option value="">Select a group</option>
     {available.map(g=><option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
    </select></div>
   <div className="flex items-end"><button className="btn btn-primary" type="button" disabled={!groupId||pending} onClick={save}>{pending?'Saving…':'Assign group'}</button></div>
  </div>
  {selected&&<p className="text-xs text-gray-600 mt-2">Usage selections: {[selected.quick_1,selected.quick_2,selected.quick_3,selected.quick_4].join(' / ')} {selected.unit}</p>}
  {result&&<p role="status" className="text-sm mt-3">{result}</p>}
  <p className="text-xs text-amber-700 mt-2">Sample configuration only. Do not reclassify cylinder or other stocked items as consumables merely to trial this screen.</p>
 </section>
}
