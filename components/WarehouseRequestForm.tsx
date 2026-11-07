'use client'

import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {requestWarehouseReplenishment} from '@/lib/actions'

type Option={id:string;name:string}
type Product={id:string;name:string;unit:string}
type Van={id:string;van_number:string}

export default function WarehouseRequestForm({warehouses,products,vans,selectedVanId,balances=[]}:{
  warehouses:Option[];products:Product[];vans:Van[];selectedVanId:string|null;
  balances?:{warehouse_id:string;product_id:string;quantity:number}[]
}){
  const [warehouse,setWarehouse]=useState(warehouses[0]?.id??'')
  const [van,setVan]=useState(selectedVanId??vans[0]?.id??'')
  const [product,setProduct]=useState('')
  const [quantity,setQuantity]=useState('1')
  const [reference,setReference]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [pending,start]=useTransition()
  const router=useRouter()
  const unit=products.find(p=>p.id===product)?.unit??'ea'
  const valid=/^\d+(?:\.\d{1,2})?$/.test(quantity)&&Number(quantity)>0&&
    (['kg','m'].includes(unit)||Number.isInteger(Number(quantity)))
  const available=Number(balances.find(b=>b.warehouse_id===warehouse&&b.product_id===product)?.quantity??0)
  const shortage=Boolean(product&&valid&&Number(quantity)>available)
  const ready=Boolean(warehouse&&van&&product&&valid&&reference.trim())
  function submit(){
    if(!ready)return
    setError('');setMessage('')
    start(async()=>{
      try{
        const result=await requestWarehouseReplenishment(warehouse,van,product,Number(quantity),reference)
        if(result.error)setError(result.error)
        else{setMessage('Request submitted. No stock moves until warehouse issue and receiving-van confirmation.');setReference('');router.refresh()}
      }catch{setError('Could not submit request. Please retry.')}
    })
  }
  return <section className={'card mt-4 border-2 '+(shortage?'border-amber-500':'border-gray-200')}>
    <h2 className="text-sm font-medium mb-2">Request warehouse replenishment</h2>
    <p className="text-xs text-gray-500 mb-3">Request stock for an authorised van. Warehouse staff review and issue the goods; the receiving van confirms delivery before stock balances change.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><label className="form-label" htmlFor="request-warehouse">Source warehouse</label><select id="request-warehouse" className="form-input" value={warehouse} onChange={e=>setWarehouse(e.target.value)}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div><label className="form-label" htmlFor="request-van">Receiving van</label><select id="request-van" className="form-input" value={van} onChange={e=>setVan(e.target.value)}>{vans.map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}</select></div>
      <div><label className="form-label" htmlFor="request-product">Product</label><select id="request-product" className="form-input" value={product} onChange={e=>setProduct(e.target.value)}><option value="">Choose product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></div>
      <div><label className="form-label" htmlFor="request-qty">Quantity ({unit})</label><input id="request-qty" className="form-input" type="number" min="0.01" step={['kg','m'].includes(unit)?'0.01':'1'} value={quantity} onChange={e=>setQuantity(e.target.value)}/></div>
      {product&&<div className={'md:col-span-2 rounded-lg border p-3 '+(shortage?'border-amber-500 bg-amber-50':'border-gray-200 bg-gray-50')} role={shortage?'alert':undefined}>
        <p className="text-sm font-semibold">Available in {warehouses.find(w=>w.id===warehouse)?.name??'warehouse'}: {available.toLocaleString('en-AU')} {unit}</p>
        {shortage?<p className="text-sm text-amber-900 mt-1"><strong>⚠ Not enough warehouse stock:</strong> requested {Number(quantity).toLocaleString('en-AU')} {unit}, short by {(Number(quantity)-available).toLocaleString('en-AU')} {unit}. You may request it now, but the warehouse cannot issue it until stock is received. <a href="/receive" className="underline font-semibold">Receive stock into warehouse</a>, or reduce the request.</p>
          :<p className="text-xs text-gray-600 mt-1">Current recorded stock is sufficient for this request.</p>}
      </div>}
      <div className="md:col-span-2"><label className="form-label" htmlFor="request-reference">Reference / reason</label><input id="request-reference" className="form-input" maxLength={500} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Job number or replenishment reference"/></div>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
    {message&&<p role="status" className="text-sm text-green-700 mt-3">{message}</p>}
    <button type="button" className="btn btn-primary mt-3" disabled={!ready||pending} onClick={submit}>{pending?'Submitting…':'Submit request'}</button>
  </section>
}
