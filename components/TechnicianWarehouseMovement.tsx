'use client'

import {useState,useTransition} from 'react'
import {returnVanStockToWarehouse,transferWarehouseToVan} from '@/lib/actions'

export default function TechnicianWarehouseMovement({warehouses,products,defaultVanId,canIssue,canReceive}:{
  warehouses:{id:string;name:string}[];
  products:{id:string;name:string;unit:string}[];
  defaultVanId:string|null;canIssue:boolean;canReceive:boolean
}){
  const [mode,setMode]=useState<'issue'|'return'>(canIssue?'issue':'return')
  const [warehouse,setWarehouse]=useState(warehouses[0]?.id??'')
  const [product,setProduct]=useState('')
  const [quantity,setQuantity]=useState('1')
  const [reference,setReference]=useState('')
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [pending,start]=useTransition()
  const unit=products.find(p=>p.id===product)?.unit??'ea'
  const valid=/^\d+(?:\.\d{1,2})?$/.test(quantity)&&Number(quantity)>0&&
    (['kg','m'].includes(unit)||Number.isInteger(Number(quantity)))
  const ready=Boolean(defaultVanId&&warehouse&&product&&reference.trim()&&valid)
  function submit(){
    if(!ready||!defaultVanId)return
    setError('');setSuccess('')
    start(async()=>{
      try{
        const result=mode==='issue'
          ? await transferWarehouseToVan(warehouse,defaultVanId,product,Number(quantity),reference)
          : await returnVanStockToWarehouse(warehouse,defaultVanId,product,Number(quantity),reference)
        if(result.error)setError(result.error)
        else{setSuccess('Movement recorded. Refresh the page for current balances.');setReference('')}
      }catch{setError('Movement not confirmed. Check balances before retrying.')}
    })
  }
  return <section className="card mt-4">
    <h2 className="text-sm font-medium mb-2">Authorised warehouse stock movement</h2>
    <p className="text-xs text-gray-500 mb-3">These actions require a separate administrator-granted warehouse permission. For now, technician movements are restricted to the assigned default van, even if another working van is selected.</p>
    <div className="flex gap-4 mb-3">
      {canIssue&&<label className="text-sm"><input type="radio" checked={mode==='issue'} onChange={()=>setMode('issue')}/> Warehouse → van</label>}
      {canReceive&&<label className="text-sm"><input type="radio" checked={mode==='return'} onChange={()=>setMode('return')}/> Van → warehouse</label>}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><label htmlFor="tech-warehouse" className="form-label">Warehouse</label><select id="tech-warehouse" className="form-input" value={warehouse} onChange={e=>setWarehouse(e.target.value)}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div><label htmlFor="tech-move-product" className="form-label">Product</label><select id="tech-move-product" className="form-input" value={product} onChange={e=>setProduct(e.target.value)}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></div>
      <div><label htmlFor="tech-move-quantity" className="form-label">Quantity ({unit})</label><input id="tech-move-quantity" type="number" min="0.01" step={['kg','m'].includes(unit)?'0.01':'1'} className="form-input" value={quantity} onChange={e=>setQuantity(e.target.value)}/></div>
      <div><label htmlFor="tech-move-ref" className="form-label">Reference / reason</label><input id="tech-move-ref" className="form-input" maxLength={500} value={reference} onChange={e=>setReference(e.target.value)}/></div>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
    {success&&<p role="status" className="text-sm text-green-700 mt-3">{success}</p>}
    <button type="button" className="btn btn-primary mt-3" onClick={submit} disabled={!ready||pending}>{pending?'Recording…':'Confirm movement'}</button>
  </section>
}
