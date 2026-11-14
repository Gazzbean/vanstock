'use client'

import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {transactionBorder} from '@/lib/transaction-confirmation'
import {requestWarehouseReplenishment} from '@/lib/actions'

type Option={id:string;name:string}
type Product={id:string;name:string;unit:string}
type Van={id:string;van_number:string}
type Pack={id:string;product_id:string;package_label:string;purchase_unit:string;units_per_package:number}

export default function WarehouseRequestForm({warehouses,products,vans,selectedVanId,balances=[],packages=[]}:{
  warehouses:Option[];products:Product[];vans:Van[];selectedVanId:string|null;
  balances?:{warehouse_id:string;product_id:string;quantity:number}[]
  packages?:Pack[]
}){
  const [mode,setMode]=useState<'pack'|'loose'|null>(null)
  const [packId,setPackId]=useState('')
  const [warehouse,setWarehouse]=useState(warehouses[0]?.id??'')
  const [van,setVan]=useState(selectedVanId??vans[0]?.id??'')
  const [product,setProduct]=useState('')
  const [quantity,setQuantity]=useState('1')
  const [reference,setReference]=useState('')
  const [message,setMessage]=useState('')
  const [completed,setCompleted]=useState(false)
  const [error,setError]=useState('')
  const [pending,start]=useTransition()
  const router=useRouter()
  const unit=products.find(p=>p.id===product)?.unit??'ea'
  const availablePacks=packages.filter(p=>p.product_id===product&&Number(p.units_per_package)>0)
  const selectedPack=availablePacks.find(p=>p.id===packId)
  const numericQuantity=Number(quantity)
  const stockQty=mode==='pack'&&selectedPack?numericQuantity*Number(selectedPack.units_per_package):numericQuantity
  const valid=Boolean(mode&&/^\d+(?:\.\d{1,2})?$/.test(quantity)&&numericQuantity>0&&numericQuantity<1000000000&&
    (mode==='loose'?(['kg','m'].includes(unit)||Number.isInteger(numericQuantity)):Number.isInteger(numericQuantity))&&
    (mode==='loose'||selectedPack)&&Number.isFinite(stockQty)&&stockQty>0&&stockQty<1000000000)
  const available=Number(balances.find(b=>b.warehouse_id===warehouse&&b.product_id===product)?.quantity??0)
  const shortage=Boolean(product&&valid&&stockQty>available)
  const ready=Boolean(warehouse&&van&&product&&valid&&reference.trim())
  function changed(){setCompleted(false);setMessage('');setError('')}
  function submit(){
    if(!ready||pending||completed)return
    setError('');setMessage('')
    start(async()=>{
      try{
        const result=await requestWarehouseReplenishment(warehouse,van,product,stockQty,reference)
        if(result.error)setError(result.error)
        else{
          setMessage(`Replenishment request submitted: ${stockQty} ${unit} of ${products.find(p=>p.id===product)?.name??'stock'}. Reference: ${reference.trim()}. Awaiting warehouse issue and receiving-van confirmation; stock has not moved.`)
          setCompleted(true)
          router.refresh()
        }
      }catch{setError('Could not submit request. Please retry.')}
    })
  }
  return <section className={'card mt-4 border-2 '+transactionBorder(completed?'success':error?'error':pending?'pending':shortage||ready?'ready':'idle')}>
    <h2 className="text-sm font-medium mb-2">Request warehouse replenishment</h2>
    <p className="text-xs text-gray-500 mb-3">Request stock for an authorised van. Warehouse staff review and issue the goods; the receiving van confirms delivery before stock balances change.</p>
    <div className={'rounded-lg border-2 p-3 mb-4 '+(mode?'border-green-500':'border-gray-200')}>
      <h3 className="text-sm font-semibold mb-2">A. How are you requesting stock?</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button type="button" aria-pressed={mode==='pack'} onClick={()=>{setMode('pack');setQuantity('1');setPackId('');changed()}} className={'rounded-lg border-2 p-3 text-left text-sm '+(mode==='pack'?'border-green-600 bg-green-50':'border-gray-200')}><strong>📦 Full packs, boxes or cartons</strong><p className="text-xs mt-1">1 pack of 500 cable ties requests 500 ea.</p></button>
        <button type="button" aria-pressed={mode==='loose'} onClick={()=>{setMode('loose');setQuantity('1');setPackId('');changed()}} className={'rounded-lg border-2 p-3 text-left text-sm '+(mode==='loose'?'border-green-600 bg-green-50':'border-gray-200')}><strong>🔩 Individual or loose items</strong><p className="text-xs mt-1">1 loose cable tie requests 1 ea.</p></button>
      </div>
    </div>
    <h3 className="text-sm font-semibold mb-2">B. Replenishment details</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div><label className="form-label" htmlFor="request-warehouse">Source warehouse</label><select id="request-warehouse" className="form-input" value={warehouse} onChange={e=>{setWarehouse(e.target.value);changed()}}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div><label className="form-label" htmlFor="request-van">Receiving van</label><select id="request-van" className="form-input" value={van} onChange={e=>{setVan(e.target.value);changed()}}>{vans.map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}</select></div>
      <div><label className="form-label" htmlFor="request-product">Product</label><select id="request-product" className="form-input" value={product} onChange={e=>{setProduct(e.target.value);setPackId('');changed()}}><option value="">Choose product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></div>
      {mode==='pack'&&<div><label className="form-label" htmlFor="request-pack">Full pack size</label><select id="request-pack" className="form-input" value={packId} disabled={!product} onChange={e=>{setPackId(e.target.value);changed()}}><option value="">Select configured pack size</option>{availablePacks.map(p=><option key={p.id} value={p.id}>{p.package_label} — {p.units_per_package} {unit} per {p.purchase_unit}</option>)}</select>{product&&availablePacks.length===0&&<p className="text-xs text-amber-800 mt-1">No pack conversion configured. Select loose items or ask an administrator to configure a pack size.</p>}</div>}
      <div><label className="form-label" htmlFor="request-qty">{mode==='pack'?'Number of full packs':`Quantity of individual items (${unit})`}</label><input id="request-qty" className="form-input" type="number" min={mode==='pack'||!['kg','m'].includes(unit)?'1':'0.01'} step={mode==='pack'||!['kg','m'].includes(unit)?'1':'0.01'} value={quantity} onChange={e=>{setQuantity(e.target.value);changed()}}/></div>
      {valid&&<div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-xs text-gray-500">Stock units requested</p><p className="font-semibold text-lg">{stockQty.toLocaleString('en-AU')} {unit}</p>{mode==='pack'&&selectedPack&&<p className="text-xs text-gray-600">{numericQuantity} × {selectedPack.units_per_package} {unit} per {selectedPack.purchase_unit}</p>}</div>}
      {product&&<div className={'md:col-span-2 rounded-lg border p-3 '+(shortage?'border-amber-500 bg-amber-50':'border-gray-200 bg-gray-50')} role={shortage?'alert':undefined}>
        <p className="text-sm font-semibold">Available in {warehouses.find(w=>w.id===warehouse)?.name??'warehouse'}: {available.toLocaleString('en-AU')} {unit}</p>
        {shortage?<p className="text-sm text-amber-900 mt-1"><strong>⚠ Not enough warehouse stock:</strong> requested {stockQty.toLocaleString('en-AU')} {unit}, short by {(stockQty-available).toLocaleString('en-AU')} {unit}. You may request it now, but the warehouse cannot issue it until stock is received. <a href="/receive" className="underline font-semibold">Receive stock into warehouse</a>, or reduce the request.</p>
          :<p className="text-xs text-gray-600 mt-1">Current recorded stock is sufficient for this request.</p>}
      </div>}
      <div className="md:col-span-2"><label className="form-label" htmlFor="request-reference">Reference / reason</label><input id="request-reference" className="form-input" maxLength={500} value={reference} onChange={e=>{setReference(e.target.value);changed()}} placeholder="Job number or replenishment reference"/></div>
    </div>
    {ready&&!message&&!error&&<div className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 p-3" role="status">
      <p className="text-sm font-semibold text-amber-900">Ready to submit — review replenishment request</p>
      <p className="text-sm text-amber-900 mt-1">{stockQty.toLocaleString('en-AU')} {unit} of {products.find(p=>p.id===product)?.name??'selected product'} → {vans.find(v=>v.id===van)?.van_number??'selected van'} · Reference: {reference.trim()}</p>
      <p className="text-xs text-amber-900 mt-1">{shortage?'Warehouse stock is insufficient; the request can be submitted but cannot be issued until stock is received.':'Submitting sends the request for warehouse review. No stock will move yet.'}</p>
    </div>}
    {error&&<p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
    {message&&<p role="status" className="alert alert-success mt-3">{message}</p>}
    <button type="button" className="btn btn-primary mt-3" disabled={!ready||pending||completed} onClick={submit}>{completed?'Request submitted':pending?'Submitting…':'Submit request'}</button>
  </section>
}
