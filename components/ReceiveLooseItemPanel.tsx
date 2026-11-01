'use client'
import {useState,useTransition} from 'react'
import {receiveLooseItem} from '@/lib/actions'
type Product={id:string;name:string;stock_unit:string|null;archived_at?:string|null}
type Supplier={id:string;name:string}
type Warehouse={id:string;name:string}
export default function ReceiveLooseItemPanel({products,suppliers,vans,warehouses}:{
 products:Product[];suppliers:Supplier[];vans:{id:string;van_number:string}[];warehouses:Warehouse[]
}){
 const active=products.filter(p=>!p.archived_at)
 const [productId,setProductId]=useState(active[0]?.id??'')
 const [supplierId,setSupplierId]=useState(suppliers[0]?.id??'')
 const [destination,setDestination]=useState(warehouses[0]?'warehouse:'+warehouses[0].id:vans[0]?'van:'+vans[0].id:'')
 const [quantity,setQuantity]=useState('1')
 const [docket,setDocket]=useState('')
 const [receiptId,setReceiptId]=useState('')
 const [pending,start]=useTransition()
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const product=active.find(p=>p.id===productId)
 const unit=product?.stock_unit??'ea'
 const amount=Number(quantity)
 const valid=!!productId&&!!supplierId&&!!destination&&docket.trim().length>0&&quantity.trim()!==''&&
   Number.isFinite(amount)&&amount>0&&(unit==='kg'||unit==='m'||Number.isInteger(amount))
 function modified(){if(!receiptId){setMessage('');setError('')}else{setError('');setMessage('')} }
 function post(){
   if(!valid){setError('Enter a valid quantity, supplier, docket and destination.');return}
   const id=receiptId||crypto.randomUUID()
   if(!receiptId)setReceiptId(id)
   const [kind,locId]=destination.split(':')
   setError('');setMessage('')
   start(async()=>{
     try{
       const r=await receiveLooseItem(id,productId,supplierId,amount,docket,kind as 'van'|'warehouse',locId)
       if(r.error){setError(r.error);return}
       setMessage('Received '+r.quantity+' '+unit+'. Stock updated. No ServiceM8 transaction created.')
       setReceiptId('');setDocket('')
     }catch{setError('The receipt status is uncertain. Do not start a new receipt; retry the same details.')}
   })
 }
 return <section className="card mt-4">
   <h2 className="text-sm font-medium mb-1">Receive individual / loose items</h2>
   <p className="text-xs text-gray-500 mb-3">Use this for items received by the each, metre or kilogram without a preconfigured pack. This records physical stock in VanStock only.</p>
   {active.length&&suppliers.length ? <>
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
      <div><label htmlFor="loose-product" className="form-label">Product</label>
       <select id="loose-product" className="form-input" value={productId} onChange={e=>{setProductId(e.target.value);modified()}}>
       {active.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label htmlFor="loose-supplier" className="form-label">Supplier</label>
       <select id="loose-supplier" className="form-input" value={supplierId} onChange={e=>{setSupplierId(e.target.value);modified()}}>
       {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label htmlFor="loose-quantity" className="form-label">Quantity ({unit})</label>
       <input id="loose-quantity" className="form-input" type="number" min={unit==='kg'||unit==='m'?'0.01':'1'} step={unit==='kg'||unit==='m'?'0.01':'1'} value={quantity} onChange={e=>{setQuantity(e.target.value);modified()}}/></div>
      <div><label htmlFor="loose-docket" className="form-label">Supplier docket</label>
       <input id="loose-docket" className="form-input" maxLength={120} placeholder="TEST-LOOSE-001" value={docket} onChange={e=>{setDocket(e.target.value);modified()}}/></div>
      <div><label htmlFor="loose-destination" className="form-label">Receive into</label>
       <select id="loose-destination" className="form-input" value={destination} onChange={e=>{setDestination(e.target.value);modified()}}>
        {warehouses.map(w=><option key={w.id} value={'warehouse:'+w.id}>{w.name}</option>)}
        {vans.map(v=><option key={v.id} value={'van:'+v.id}>{v.van_number}</option>)}
       </select></div>
    </div>
    <p className="text-xs text-gray-600 mt-3">Will receive <strong>{valid?amount:'—'} {unit}</strong> as individual stock units. Supplier pack conversions are not applied.</p>
    <button className="btn btn-primary mt-2" type="button" disabled={!valid||pending} onClick={post}>{pending?'Receiving…':'Confirm loose-item receipt'}</button>
    {error&&<p className="text-sm text-red-700 mt-2" role="alert">{error}</p>}
    {message&&<p className="text-sm text-green-700 mt-2" role="status">{message}</p>}
   </>:<p className="text-sm text-gray-500">An active product and supplier are required before receiving loose items.</p>}
   <p className="text-xs text-amber-700 mt-2">Cylinders require their own serial-number receiving workflow, which is still under development. Do not use this form for physical cylinders.</p>
 </section>
}
