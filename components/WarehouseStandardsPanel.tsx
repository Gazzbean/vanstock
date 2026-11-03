'use client'
import {useState,useTransition} from 'react'
import {saveWarehouseStockStandard} from '@/lib/actions'
type Product={id:string;name:string;stock_unit:string|null;archived_at?:string|null}
type Warehouse={id:string;name:string}
type Standard={warehouse_id:string;product_id:string;min_quantity:number;target_quantity:number}
export default function WarehouseStandardsPanel({products,warehouses,standards}:{products:Product[];warehouses:Warehouse[];standards:Standard[]}){
 const available=products.filter(p=>!p.archived_at)
 const [warehouse,setWarehouse]=useState(warehouses[0]?.id??'')
 const [product,setProduct]=useState(available[0]?.id??'')
 const find=(wid:string,pid:string)=>standards.find(s=>s.warehouse_id===wid&&s.product_id===pid)
 const initial=find(warehouse,product)
 const [minimum,setMinimum]=useState(String(initial?.min_quantity??0))
 const [target,setTarget]=useState(String(initial?.target_quantity??0))
 const [message,setMessage]=useState('')
 const [pending,start]=useTransition()
 const unit=available.find(p=>p.id===product)?.stock_unit??'ea'
 function select(wid:string,pid:string){setWarehouse(wid);setProduct(pid);const s=find(wid,pid);setMinimum(String(s?.min_quantity??0));setTarget(String(s?.target_quantity??0));setMessage('')}
 function save(){setMessage('');start(async()=>{try{const r=await saveWarehouseStockStandard(warehouse,product,Number(minimum),Number(target));setMessage(r.error??'Warehouse thresholds saved. Existing inventory unchanged.')}catch{setMessage('Warehouse thresholds could not be saved.')}})}
 return <section className="card mt-4">
  <h2 className="text-sm font-medium mb-2">Warehouse minimum and target stock</h2>
  <p className="text-xs text-gray-500 mb-3">These are independent of each van's reorder minimum and target. A zero minimum disables the warehouse low-stock threshold.</p>
  {warehouses.length>0&&available.length>0?<div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
   <label className="form-label">Warehouse<select className="form-input mt-1" value={warehouse} onChange={e=>select(e.target.value,product)}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
   <label className="form-label">Product<select className="form-input mt-1" value={product} onChange={e=>select(warehouse,e.target.value)}>{available.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label className="form-label">Warehouse minimum ({unit})<input className="form-input mt-1" type="number" min="0" step={['kg','m'].includes(unit)?'0.01':'1'} value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
   <label className="form-label">Target quantity ({unit})<input className="form-input mt-1" type="number" min="0" step={['kg','m'].includes(unit)?'0.01':'1'} value={target} onChange={e=>setTarget(e.target.value)}/></label>
   <button type="button" className="btn btn-primary" disabled={pending||!warehouse||!product} onClick={save}>{pending?'Saving…':'Save warehouse thresholds'}</button>
  </div>:<p className="text-xs text-gray-500">Add a warehouse and active products to configure thresholds.</p>}
  {message&&<p role="status" className="text-xs mt-2">{message}</p>}
 </section>
}
