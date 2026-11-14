'use client'

import StatusNotice from './StatusNotice'
import {useState,useRef,useTransition} from 'react'
import {adjustWarehouseStock} from '@/lib/actions'
import {transactionBorder} from '@/lib/transaction-confirmation'

type Warehouse={id:string;name:string}
type Product={id:string;name:string;unit:string}
type Balance={warehouse_id:string;product_id:string;quantity:number;committed_quantity?:number}

// Corrections and verified warehouse counts ONLY. Van returns have a separate,
// single controlled entry point at /warehouse/returns.
export default function WarehouseCorrections({
 warehouses,products,balances,enabled,canAdjust,canStocktake,
}:{
 warehouses:Warehouse[];products:Product[];balances:Balance[];
 enabled:boolean;canAdjust:boolean;canStocktake:boolean
}){
 const [warehouseId,setWarehouseId]=useState('')
 const [productId,setProductId]=useState('')
 const [operation,setOperation]=useState<'add'|'remove'|'set'>(canAdjust?'add':'set')
 const [qty,setQty]=useState('1')
 const [reference,setReference]=useState('')
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [completed,setCompleted]=useState(false)
 const [pending,start]=useTransition()
 const locked=useRef(false)
 const product=products.find(p=>p.id===productId)
 const current=balances.find(b=>b.warehouse_id===warehouseId&&b.product_id===productId)
 const decimal=product?.unit==='kg'||product?.unit==='m'
 const precise=decimal?/^\d+(?:\.\d{1,2})?$/.test(qty):/^\d+$/.test(qty)
 const amount=Number(qty)
 const committed=Number(current?.committed_quantity??0)
 const available=Number(current?.quantity??0)-committed
 const allowed=operation==='set'?canStocktake:canAdjust
 const ready=enabled&&allowed&&!!warehouseId&&!!productId&&!!current&&precise&&Number.isFinite(amount)&&amount>=0&&!!reference.trim()&&reference.trim().length<=450&&
   (operation==='set'?(amount!==Number(current.quantity)&&amount>=committed):(amount>0&&(operation!=='remove'||amount<=available)))
 const availableProducts=products.filter(p=>balances.some(b=>b.warehouse_id===warehouseId&&b.product_id===p.id))
 function changed(){setError('');setSuccess('');setCompleted(false)}
 function submit(){
  if(!ready||completed||pending||locked.current)return
  locked.current=true
  setError('');setSuccess('')
  start(async()=>{
    try{
      const result=await adjustWarehouseStock(warehouseId,productId,operation,amount,reference.trim())
      if(result.error)setError(result.error)
      else{
        setSuccess('Warehouse '+(operation==='set'?'verified count':'adjustment')+' recorded with an audit reference in Transaction History. Refresh before making another correction.')
        setCompleted(true)
      }
    }catch{setError('Could not confirm this correction. Verify current stock and Transaction History before retrying.')}
    finally{locked.current=false}
  })
 }
 return <section className={'card mt-4 border-2 '+transactionBorder(completed?'success':error?'error':pending?'pending':ready?'ready':'idle')}>
  <h2 className="text-sm font-semibold mb-2">Warehouse adjustments &amp; verified stocktakes</h2>
  <p className="text-xs text-gray-500 mb-4">Corrections and verified counts are separately authorised and audited. To return goods from a van, use <a className="text-blue-700 underline" href="/warehouse/returns">Return stock from van</a>. Stock already committed to issued requests cannot be removed.</p>
  {!enabled?(
    <StatusNotice tone="warning" title="Warehouse adjustments unavailable">
      Warehouse corrections and stocktakes are disabled pending controlled-release approval. No adjustment form is available.
    </StatusNotice>
  ):<>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div>
     <label className="form-label" htmlFor="correction-wh">Warehouse</label>
     <select id="correction-wh" className="form-input" value={warehouseId} onChange={e=>{setWarehouseId(e.target.value);setProductId('');changed()}}>
      <option value="">Select warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
     </select>
    </div>
    <div>
     <label className="form-label" htmlFor="adjust-op">Adjustment / count</label>
     <select id="adjust-op" className="form-input" value={operation} onChange={e=>{setOperation(e.target.value as 'add'|'remove'|'set');changed()}}>
      {canAdjust&&<option value="add">Add to recorded stock</option>}
      {canAdjust&&<option value="remove">Remove from recorded stock</option>}
      {canStocktake&&<option value="set">Set verified physical count</option>}
     </select>
    </div>
    <div>
     <label className="form-label" htmlFor="correction-product">Product</label>
     <select id="correction-product" className="form-input" value={productId} onChange={e=>{setProductId(e.target.value);changed()}}>
      <option value="">Select product</option>{availableProducts.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
     </select>
     {current&&<p className="text-xs text-gray-500 mt-1">Recorded: {current.quantity} {product?.unit} · Committed: {committed} {product?.unit} · Available: {Math.round(available*100)/100} {product?.unit}</p>}
    </div>
    <div>
     <label className="form-label" htmlFor="correction-qty">{operation==='set'?'Verified count':'Quantity'} ({product?.unit??'ea'})</label>
     <input id="correction-qty" className="form-input" type="number" min={operation==='set'?'0':decimal?'0.01':'1'}
       step={decimal?'0.01':'1'} value={qty} onChange={e=>{setQty(e.target.value);changed()}}/>
    </div>
    <div className="md:col-span-2">
     <label className="form-label" htmlFor="correction-ref">Reason for correction / stocktake (required)</label>
     <input id="correction-ref" className="form-input" maxLength={450} value={reference}
       onChange={e=>{setReference(e.target.value);changed()}} placeholder="e.g. Approved physical count, damaged stock"/>
     <p className="text-xs text-gray-500 mt-1">A {operation==='set'?'STK':'ADJ'} reference is generated automatically.</p>
    </div>
   </div>
   {warehouseId&&availableProducts.length===0&&<p className="text-xs text-amber-700 mt-3">No opening balances exist in this warehouse. Use Opening warehouse stocktake first.</p>}
   {error&&<div className="mt-3"><StatusNotice tone="error" title="Warehouse correction not recorded">{error}</StatusNotice></div>}
   {success&&<div className="mt-3"><StatusNotice tone="success" title="Warehouse correction recorded">{success}</StatusNotice></div>}
   {ready&&!pending&&!completed&&!error&&<p className="text-sm text-amber-800 mt-3">Ready to submit — verify the warehouse, quantity, product and reason.</p>}
   <button className="btn btn-primary mt-4" type="button" disabled={!ready||pending||completed} onClick={submit}>
    {completed?'Correction recorded':pending?'Recording…':operation==='set'?'Confirm verified count':'Record adjustment'}
   </button>
  </>}
 </section>
}
