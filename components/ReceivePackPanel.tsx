'use client'
import {useState,useTransition} from 'react'
import {receiveSupplierPack} from '@/lib/actions'

type Product={id:string;name:string;stock_unit:string|null}
type Supplier={id:string;name:string}
type Pack={id:string;product_id:string;supplier_id:string;package_label:string;units_per_package:number;purchase_unit:string;supplier_code:string|null}
type Location={id:string;name:string}
export default function ReceivePackPanel({products,suppliers,packages,vans,warehouses}:{
 products:Product[];suppliers:Supplier[];packages:Pack[];
 vans:{id:string;van_number:string}[];warehouses:Location[]
}){
 const [packageId,setPackageId]=useState(packages[0]?.id??'')
 const [count,setCount]=useState('1')
 const [docket,setDocket]=useState('')
 const [destination,setDestination]=useState(warehouses[0]?'warehouse:'+warehouses[0].id:vans[0]?'van:'+vans[0].id:'')
 const [receiptId,setReceiptId]=useState('')
 const [busy,start]=useTransition()
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const pkg=packages.find(p=>p.id===packageId)
 const product=products.find(p=>p.id===pkg?.product_id)
 const supplier=suppliers.find(s=>s.id===pkg?.supplier_id)
 const qty=Number(count)*Number(pkg?.units_per_package??0)
 const valid=Boolean(pkg&&destination&&docket.trim()&&Number.isFinite(Number(count))&&Number(count)>0&&Number.isFinite(qty)&&qty>0)
 function resetReceipt(){
  setReceiptId('');setSuccess('');setError('')
 }
 function submit(){
  if(!valid){setError('Select a supplier pack, location, pack count and docket reference.');return}
  // Stable ID for this pending transaction: retrying uses the same ID.
  const id=receiptId||crypto.randomUUID()
  if(!receiptId)setReceiptId(id)
  const [kind,locationId]=destination.split(':')
  setError('');setSuccess('')
  start(async()=>{
   try{
    const r=await receiveSupplierPack(id,packageId,Number(count),docket,kind as 'van'|'warehouse',locationId)
    if(r.error){setError(r.error);return}
    setSuccess('Received '+r.quantity+' '+(product?.stock_unit??'ea')+' into '+(kind==='van'?vans.find(v=>v.id===locationId)?.van_number:warehouses.find(w=>w.id===locationId)?.name)+'. Save confirmed.')
    setReceiptId('');setDocket('')
   }catch{setError('Receipt status could not be confirmed. Do not create a second receipt; retry with the same details.')}
  })
 }
 return <section className="card mt-4">
  <h2 className="text-sm font-medium mb-2">Receive supplier purchase packs</h2>
  <p className="text-xs text-gray-500 mb-3">Converts supplier packs to stock units and records a receipt. This does change physical sample inventory; do not use real purchases during testing.</p>
  {packages.length?<>
   <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
    <div><label className="form-label" htmlFor="receive-package">Supplier purchase option</label>
     <select id="receive-package" className="form-input" value={packageId} onChange={e=>{setPackageId(e.target.value);resetReceipt()}}>
      {packages.map(p=><option key={p.id} value={p.id}>{suppliers.find(s=>s.id===p.supplier_id)?.name??'Supplier'} · {products.find(x=>x.id===p.product_id)?.name??'Product'} · {p.package_label}</option>)}
     </select>
    </div>
    <div><label className="form-label" htmlFor="receive-count">Number of packs</label>
     <input id="receive-count" className="form-input" type="number" min="0.01" step="1" value={count} onChange={e=>{setCount(e.target.value);resetReceipt()}}/>
    </div>
    <div><label className="form-label" htmlFor="receive-docket">Supplier docket / test reference</label>
     <input id="receive-docket" className="form-input" maxLength={120} placeholder="TEST-PACK-001" value={docket} onChange={e=>{setDocket(e.target.value);resetReceipt()}}/>
    </div>
    <div><label className="form-label" htmlFor="receive-destination">Receiving location</label>
     <select id="receive-destination" className="form-input" value={destination} onChange={e=>{setDestination(e.target.value);resetReceipt()}}>
      {warehouses.map(w=><option key={w.id} value={'warehouse:'+w.id}>{w.name}</option>)}
      {vans.map(v=><option key={v.id} value={'van:'+v.id}>{v.van_number}</option>)}
     </select>
    </div>
   </div>
   <p className="text-xs text-gray-600 my-3">Supplier: {supplier?.name??'—'} · Package: {pkg?.package_label??'—'} · Conversion: {pkg?.units_per_package??0} {product?.stock_unit??'ea'} per pack · <strong>Receipt quantity: {Number.isFinite(qty)?qty:'—'} {product?.stock_unit??'ea'}</strong></p>
   <button type="button" className="btn btn-primary" disabled={busy||!valid} onClick={submit}>{busy?'Receiving…':'Confirm supplier receipt'}</button>
   {error&&<p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
   {success&&<p role="status" className="text-sm text-green-700 mt-2">{success}</p>}
  </>:<p className="text-xs text-gray-500">No supplier purchase packages configured. First create a synthetic supplier and product package above.</p>}
 </section>
}
