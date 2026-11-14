'use client'

import {useRef,useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import StatusNotice from './StatusNotice'
import {transactionBorder} from '@/lib/transaction-confirmation'
import {returnVanStockToWarehouse} from '@/lib/actions'

type Warehouse={id:string;name:string}
type Van={id:string;van_number:string}
type Product={id:string;name:string;unit:string}

// Single entry point for Van → Warehouse returns. This is NOT a direct
// warehouse-to-van issue: replenishment retains its two-confirmation process.
export default function TechnicianWarehouseMovement({
  warehouses,products,vans,enabled=false,
}:{
  warehouses:Warehouse[];products:Product[];vans:Van[];enabled?:boolean
}){
  const router=useRouter()
  const locked=useRef(false)
  // Neither company van nor destination warehouse is silently selected.
  const [van,setVan]=useState('')
  const [warehouse,setWarehouse]=useState('')
  const [product,setProduct]=useState('')
  const [quantity,setQuantity]=useState('1')
  const [reference,setReference]=useState('')
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [completed,setCompleted]=useState(false)
  const [pending,start]=useTransition()
  const currentProduct=products.find(p=>p.id===product)
  const unit=currentProduct?.unit??'ea'
  const amount=Number(quantity)
  const validQuantity=/^\d+(?:\.\d{1,2})?$/.test(quantity) && Number.isFinite(amount) && amount>0 &&
    (['kg','m'].includes(unit) || Number.isInteger(amount))
  const ready=Boolean(van&&warehouse&&product&&reference.trim()&&reference.trim().length<=450&&validQuantity)
  const sourceName=vans.find(v=>v.id===van)?.van_number??'selected van'
  const destinationName=warehouses.find(w=>w.id===warehouse)?.name??'selected warehouse'
  const change=()=>{setCompleted(false);setSuccess('');setError('')}

  function submit(){
    if(!enabled||!ready||locked.current||pending||completed)return
    locked.current=true
    setError('');setSuccess('')
    start(async()=>{
      try{
        const result=await returnVanStockToWarehouse(warehouse,van,product,amount,reference.trim())
        if(result.error)setError(result.error)
        else{
          setSuccess(`Return recorded: ${amount} ${unit} of ${currentProduct?.name??'stock'} from ${sourceName} to ${destinationName}. Audit reason: ${reference.trim()}.`)
          setCompleted(true)
          router.refresh()
        }
      }catch{
        setError('Return not confirmed. Check balances and Transaction History before retrying.')
      }finally{locked.current=false}
    })
  }

  return <section className={'card mt-4 border-2 '+transactionBorder(completed?'success':error?'error':pending?'pending':ready&&enabled?'ready':'idle')}>
    <h2 className="text-sm font-semibold mb-2">Return stock from van to warehouse</h2>
    <p className="text-xs text-gray-500 mb-3">Choose the source van and destination warehouse explicitly. Confirm the actual stock being returned. A recorded return immediately debits the source van, credits the warehouse and creates an audit event.</p>
    {!enabled?(
      <StatusNotice tone="warning" title="Warehouse stock movements unavailable">
        Warehouse returns are disabled pending controlled-release approval. No stock movement can be submitted. Contact your System Administrator.
      </StatusNotice>
    ):<>
      {vans.length===0||warehouses.length===0?(
        <StatusNotice tone="warning" title="Return not available">
          {vans.length===0?'No eligible source van is selected. Select your authorised Working Van on My Van Stock.':'No warehouse destination is configured.'}
        </StatusNotice>
      ):<>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="form-label" htmlFor="return-source-van">Source van (required)</label>
          <select id="return-source-van" className="form-input" value={van} onChange={e=>{setVan(e.target.value);change()}}>
            <option value="">Select source van</option>
            {vans.map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="return-destination-warehouse">Destination warehouse (required)</label>
          <select id="return-destination-warehouse" className="form-input" value={warehouse} onChange={e=>{setWarehouse(e.target.value);change()}}>
            <option value="">Select destination warehouse</option>
            {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="return-product">Product</label>
          <select id="return-product" className="form-input" value={product} onChange={e=>{setProduct(e.target.value);change()}}>
            <option value="">Select product</option>
            {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="return-quantity">Quantity ({unit})</label>
          <input id="return-quantity" className="form-input" inputMode="decimal" type="number" min={['kg','m'].includes(unit)?'0.01':'1'}
            step={['kg','m'].includes(unit)?'0.01':'1'} value={quantity} onChange={e=>{setQuantity(e.target.value);change()}}/>
        </div>
        <div className="md:col-span-2">
          <label className="form-label" htmlFor="return-reason">Return reason / original job reference (required)</label>
          <input id="return-reason" className="form-input" maxLength={450} value={reference}
            onChange={e=>{setReference(e.target.value);change()}} placeholder="e.g. Unused materials returned from JOB-123"/>
          <p className="text-xs text-gray-500 mt-1">VanStock assigns a transaction reference in Transaction History.</p>
        </div>
      </div>
      {error&&<div className="mt-3"><StatusNotice tone="error" title="Warehouse return not recorded">{error}</StatusNotice></div>}
      {success&&<div className="mt-3"><StatusNotice tone="success" title="Warehouse return recorded">{success}</StatusNotice></div>}
      {!completed&&ready&&!pending&&!error&&<div className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 p-3" role="status">
        <p className="text-sm font-semibold text-amber-900">Ready to confirm — review return</p>
        <p className="text-sm text-amber-900 mt-1">{sourceName} → {destinationName}: {amount} {unit} of {currentProduct?.name}. Reference: {reference.trim()}</p>
        <p className="text-xs text-amber-900 mt-1">Confirm only after the goods are physically returned to the destination.</p>
      </div>}
      <button type="button" className="btn btn-primary mt-3" disabled={!ready||pending||completed} onClick={submit}>
        {completed?'Return recorded':pending?'Recording…':'Confirm warehouse return'}
      </button>
      </>}
    </>}
  </section>
}
