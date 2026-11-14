'use client'
import StatusNotice from './StatusNotice'
import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {reportWarehouseReceiptDiscrepancy,resolveWarehouseReceiptDiscrepancy} from '@/lib/actions'

type Discrepancy={observed_quantity:number;reason:string;resolved_at:string|null;resolution_note:string|null}
export default function WarehouseReceiptExceptionActions({requestId,quantity,unit,discrepancy,canReport,canResolve}:{
 requestId:string;quantity:number;unit:string;discrepancy:Discrepancy|null;canReport:boolean;canResolve:boolean
}){
 const router=useRouter()
 const [open,setOpen]=useState(false)
 const [count,setCount]=useState(String(quantity))
 const [reason,setReason]=useState('')
 const [note,setNote]=useState('')
 const [pending,start]=useTransition()
 const [error,setError]=useState('')
 const unresolved=Boolean(discrepancy&&!discrepancy.resolved_at)
 function report(){setError('');start(async()=>{
  const result=await reportWarehouseReceiptDiscrepancy(requestId,Number(count),reason)
  if(result.error)setError(result.error)
  else{setOpen(false);router.refresh()}
 })}
 function resolve(){setError('');start(async()=>{
  const result=await resolveWarehouseReceiptDiscrepancy(requestId,note)
  if(result.error)setError(result.error)
  else{setOpen(false);router.refresh()}
 })}
 return <div className="mt-2 min-w-52 text-left text-xs">
  {unresolved?<div className="rounded-lg border-2 border-orange-500 bg-orange-50 p-3 space-y-2">
   <strong className="text-orange-900">Receipt on hold — discrepancy reported</strong>
   <p>Counted: {discrepancy?.observed_quantity} {unit} of {quantity} {unit} issued.</p>
   <p>Reason: {discrepancy?.reason}</p>
   <p>No stock movement has been recorded. Warehouse staff must physically reconcile the issue before receipt can be completed.</p>
   {canResolve&&<>{!open?<button type="button" className="btn min-h-11" onClick={()=>setOpen(true)}>Review reconciliation</button>:<>
    <label className="form-label" htmlFor={`resolve-${requestId}`}>How was the full issued quantity accounted for?</label>
    <textarea id={`resolve-${requestId}`} className="form-input w-full" value={note} onChange={e=>setNote(e.target.value)} rows={2}/>
    <button type="button" className="btn btn-primary min-h-11" disabled={pending||note.trim().length<5} onClick={resolve}>Mark reconciled — allow receipt</button>
    <button type="button" className="btn min-h-11 ml-2" onClick={()=>setOpen(false)}>Cancel</button>
   </>}</>}
  </div>:canReport&&!discrepancy?<>{!open?<button type="button" className="btn min-h-11 text-orange-900" onClick={()=>setOpen(true)}>Report shortage or damage</button>:<div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-3 space-y-2">
   <strong>Report a receiving discrepancy</strong>
   <p>This places receipt on hold. It does not change stock quantities.</p>
   <label className="form-label" htmlFor={`count-${requestId}`}>Quantity physically received ({unit})</label>
   <input id={`count-${requestId}`} className="form-input w-full" type="number" min={0} max={quantity} step="any" value={count} onChange={e=>setCount(e.target.value)}/>
   <label className="form-label" htmlFor={`reason-${requestId}`}>What is missing, damaged or incorrect?</label>
   <textarea id={`reason-${requestId}`} className="form-input w-full" value={reason} onChange={e=>setReason(e.target.value)} rows={2}/>
   <button type="button" className="btn btn-primary min-h-11" disabled={pending||reason.trim().length<5||count.trim()===''||!Number.isFinite(Number(count))||Number(count)<0||Number(count)>quantity} onClick={report}>Submit discrepancy — hold receipt</button>
   <button type="button" className="btn min-h-11 ml-2" onClick={()=>setOpen(false)}>Cancel</button>
  </div>}</>:discrepancy?.resolved_at?<StatusNotice tone="success" title="Discrepancy reconciled">Final receipt can now be confirmed.</StatusNotice>:null}
  {error&&<div className="mt-3"><StatusNotice tone="error" title="Warehouse discrepancy action failed">{error}</StatusNotice></div>}
 </div>
}
