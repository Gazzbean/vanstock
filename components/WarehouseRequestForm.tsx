'use client'

import {useState,useTransition} from 'react'
import {requestWarehouseReplenishment} from '@/lib/actions'

type Option={id:string;name:string}
type Product={id:string;name:string;unit:string}
type Van={id:string;van_number:string}

export default function WarehouseRequestForm({warehouses,products,vans,selectedVanId}:{
  warehouses:Option[];products:Product[];vans:Van[];selectedVanId:string|null
}){
  const [warehouse,setWarehouse]=useState(warehouses[0]?.id??'')
  const [van,setVan]=useState(selectedVanId??vans[0]?.id??'')
  const [product,setProduct]=useState('')
  const [quantity,setQuantity]=useState('1')
  const [reference,setReference]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [pending,start]=useTransition()
  const unit=products.find(p=>p.id===product)?.unit??'ea'
  const valid=/^\d+(?:\.\d{1,2})?$/.test(quantity)&&Number(quantity)>0&&
    (['kg','m'].includes(unit)||Number.isInteger(Number(quantity)))
  const ready=Boolean(warehouse&&van&&product&&valid&&reference.trim())
  function submit(){
    if(!ready)return
    setError('');setMessage('')
    start(async()=>{
      try{
        const result=await requestWarehouseReplenishment(warehouse,van,product,Number(quantity),reference)
        if(result.error)setError(result.error)
        else{setMessage('Request submitted. Warehouse stock is unchanged until fulfilment.');setReference('')}
      }catch{setError('Could not submit request. Please retry.')}
    })
  }
  return <section className="card mt-4">
    <h2 className="text-sm font-medium mb-2">Request warehouse replenishment</h2>
    <p className="text-xs text-gray-500 mb-3">Request stock for an authorised van. An office manager must approve and then fulfil the request. No stock moves when this form is submitted.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><label className="form-label" htmlFor="request-warehouse">Source warehouse</label><select id="request-warehouse" className="form-input" value={warehouse} onChange={e=>setWarehouse(e.target.value)}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div><label className="form-label" htmlFor="request-van">Receiving van</label><select id="request-van" className="form-input" value={van} onChange={e=>setVan(e.target.value)}>{vans.map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}</select></div>
      <div><label className="form-label" htmlFor="request-product">Product</label><select id="request-product" className="form-input" value={product} onChange={e=>setProduct(e.target.value)}><option value="">Choose product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></div>
      <div><label className="form-label" htmlFor="request-qty">Quantity ({unit})</label><input id="request-qty" className="form-input" type="number" min="0.01" step={['kg','m'].includes(unit)?'0.01':'1'} value={quantity} onChange={e=>setQuantity(e.target.value)}/></div>
      <div className="md:col-span-2"><label className="form-label" htmlFor="request-reference">Reference / reason</label><input id="request-reference" className="form-input" maxLength={500} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Job number or replenishment reference"/></div>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
    {message&&<p role="status" className="text-sm text-green-700 mt-3">{message}</p>}
    <button type="button" className="btn btn-primary mt-3" disabled={!ready||pending} onClick={submit}>{pending?'Submitting…':'Submit request'}</button>
  </section>
}
