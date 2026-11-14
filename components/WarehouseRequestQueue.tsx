'use client'

import {useEffect,useRef,useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {processWarehouseRequest,rejectWarehouseRequest,confirmWarehouseReceipt} from '@/lib/actions'
import WarehouseReceiptExceptionActions from './WarehouseReceiptExceptionActions'
import RequestProgress from './RequestProgress'
import WorkflowHelp from './WorkflowHelp'
import StatusNotice from './StatusNotice'

type Request={id:string;warehouse_id:string;van_id:string;product_id:string;quantity:number;reference:string;status:string;created_at:string;requested_by_label:string;reviewed_by_label:string;reviewed_at:string|null;rejection_reason:string|null;fulfilled_by_label:string;issued_by_label:string;received_by_label:string;discrepancy:{observed_quantity:number;reason:string;resolved_at:string|null;resolution_note:string|null}|null}
const requestKey=(request:Request)=>`${request.id}:${request.status}`

export default function WarehouseRequestQueue({requests,warehouses,vans,products,canManage,canApprove=canManage,canIssue=canManage,canReceive=canManage,writesEnabled,receiverVanIds=[],balances=[]}:{
  requests:Request[];warehouses:{id:string;name:string}[];
  vans:{id:string;van_number:string}[];products:{id:string;name:string;unit:string}[];
  canManage:boolean;canApprove?:boolean;canIssue?:boolean;canReceive?:boolean;writesEnabled:boolean;receiverVanIds?:string[];
  balances?:{warehouse_id:string;product_id:string;quantity:number}[]
}){
  const [busy,start]=useTransition()
  const lockedActions=useRef(new Set<string>())
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [completed,setCompleted]=useState<string[]>([])
  const [receiptReview,setReceiptReview]=useState<string|null>(null)
  const [rejectReview,setRejectReview]=useState<string|null>(null)
  const [rejectionReasons,setRejectionReasons]=useState<Record<string,string>>({})
  const [filter,setFilter]=useState<'open'|'all'|'fulfilled'|'rejected'>('open')
  const visible=requests.filter(r=>filter==='all'||(filter==='open'?['pending','approved','issued'].includes(r.status):r.status===filter))
  const router=useRouter()
  useEffect(()=>{
    if(window.innerWidth<768&&window.location.hash.startsWith('#warehouse-request-')){
      const id=window.location.hash.slice('#warehouse-request-'.length)
      document.getElementById(`warehouse-request-mobile-${id}`)?.scrollIntoView({block:'start'})
    }
  },[])
  const name=(list:{id:string;name?:string;van_number?:string}[],id:string)=>{
    const item=list.find(x=>x.id===id);return item?.name??item?.van_number??'Unknown'
  }
  function lockAction(id:string){
    const r=requests.find(x=>x.id===id)
    if(!r||busy)return null
    const key=requestKey(r)
    if(lockedActions.current.has(key)||completed.includes(key))return null
    lockedActions.current.add(key)
    return key
  }
  function act(id:string,action:'approve'|'fulfil'){
    const key=lockAction(id)
    if(!key)return
    setError('');setSuccess('')
    start(async()=>{
      try{
        const result=await processWarehouseRequest(id,action)
        if(result.error){lockedActions.current.delete(key);setError(result.error)}
        else{setCompleted(prev=>[...prev,key]);setSuccess(action==='approve'?'Request approved. No stock has moved.':'Warehouse issue recorded. Quantity is committed and unavailable for another issue. Awaiting receiving-van confirmation; recorded balances have not moved.');router.refresh()}
      }catch{lockedActions.current.delete(key);setError('Request could not be processed. Refresh before retrying.')}
    })
  }
  function reject(id:string){
    if(busy)return
    const reason=(rejectionReasons[id]??'').trim()
    if(reason.length<3||reason.length>500){
      setError('Enter a rejection reason between 3 and 500 characters.')
      return
    }
    const key=lockAction(id)
    if(!key)return
    setError('');setSuccess('')
    start(async()=>{
      try{
        const result=await rejectWarehouseRequest(id,reason)
        if(result.error){lockedActions.current.delete(key);setError(result.error);return}
        setCompleted(prev=>[...prev,key])
        setRejectReview(null)
        setRejectionReasons(prev=>{const next={...prev};delete next[id];return next})
        setSuccess('Request rejected. The reason and reviewer have been recorded.')
        router.refresh()
      }catch{lockedActions.current.delete(key);setError('Rejection status is uncertain. Refresh and review the request before retrying.')}
    })
  }
  function rejectionReview(r:Request,scope:'mobile'|'desktop'){
    const reason=rejectionReasons[r.id]??''
    const fieldId=`warehouse-reject-${scope}-${r.id}`
    return <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 space-y-2 min-w-56">
      <p className="font-semibold text-sm text-amber-950">Reject request {r.reference}?</p>
      <label className="form-label" htmlFor={fieldId}>Rejection reason (required)</label>
      <textarea id={fieldId} className="form-input min-h-20" maxLength={500} rows={3}
        placeholder="Explain why the request is being rejected"
        value={reason} onChange={e=>setRejectionReasons(prev=>({...prev,[r.id]:e.target.value}))}/>
      <p className="text-xs text-amber-900">3–500 characters. The reason will be retained in request history.</p>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn bg-red-700 text-white"
          disabled={busy||reason.trim().length<3||reason.trim().length>500}
          onClick={()=>reject(r.id)}>{busy?'Recording…':'Confirm rejection'}</button>
        <button type="button" className="btn" disabled={busy}
          onClick={()=>setRejectReview(null)}>Cancel</button>
      </div>
    </div>
  }
  function receive(id:string){
    const key=lockAction(id)
    if(!key)return
    setError('');setSuccess('')
    start(async()=>{
      try{
        const result=await confirmWarehouseReceipt(id)
        if(result.error){lockedActions.current.delete(key);setError(result.error)}
        else{setCompleted(prev=>[...prev,key]);setReceiptReview(null);setSuccess('Receipt confirmed. Warehouse and van balances have been updated.');router.refresh()}
      }catch{lockedActions.current.delete(key);setError('Receipt status is uncertain. Refresh and check the request before retrying.')}
    })
  }
  return <section id="warehouse-requests" className="card mt-4 scroll-mt-4">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-2">
      <h2 className="text-sm font-medium">{canManage?'Warehouse replenishment requests':'My warehouse replenishment requests'}</h2>
      <WorkflowHelp title="Warehouse replenishment · 4 stages" href="/help#replenishment" steps={[
        'Request — a technician requests stock for the receiving van.',
        'Approve — an authorised person reviews and approves the request.',
        'Issue — warehouse personnel physically issue the goods. The quantity is committed and cannot be issued again; recorded balances do not change yet.',
        'Receive — the receiving technician checks the delivery and confirms it. Only then do warehouse and van stock balances change.',
        'If goods are missing or damaged, report the discrepancy instead of confirming receipt.'
      ]}/>
    </div>
    <p className="text-xs text-gray-500 mb-3">Issue commits stock and reduces warehouse availability immediately. Recorded warehouse and van balances change only after the receiving van confirms the full delivery. Missing or damaged goods must be reconciled first.</p>
    <div className="mb-3"><label className="form-label" htmlFor="warehouse-request-filter">Show requests</label><select id="warehouse-request-filter" className="form-input max-w-xs" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="open">Pending, approved & awaiting receipt</option><option value="all">All requests</option><option value="fulfilled">Received</option><option value="rejected">Rejected</option></select></div>
    {error&&<div className="mb-3"><StatusNotice tone="error" title="Warehouse request action failed">{error}</StatusNotice></div>}
    {success&&<div className="mb-3"><StatusNotice tone="success" title="Warehouse request updated">{success}</StatusNotice></div>}
    {visible.length===0?<p className="text-sm text-gray-500">No requests match this filter.</p>:<>
      <div className="md:hidden space-y-3">
        {visible.map(r=>{
          const unit=products.find(p=>p.id===r.product_id)?.unit??'ea'
          const available=Number(balances.find(b=>b.warehouse_id===r.warehouse_id&&b.product_id===r.product_id)?.quantity??0)
          const shortage=r.status==='approved'&&r.quantity>available
          const receiptBlocked=Boolean(r.discrepancy&&!r.discrepancy.resolved_at)
          return <article id={`warehouse-request-mobile-${r.id}`} key={r.id} className="rounded-xl border-2 border-amber-200 p-3 space-y-3">
            <div className="flex items-start justify-between gap-2"><strong className="text-sm">{name(products,r.product_id)}</strong><span className="text-xs rounded-full bg-amber-100 text-amber-900 px-2 py-1">{r.status==='issued'?'Awaiting receipt':r.status==='approved'?'Ready to issue':r.status==='pending'?'Awaiting approval':r.status==='fulfilled'?'Received':'Rejected'}</span></div>
            <p className="text-sm">{name(warehouses,r.warehouse_id)} → {name(vans,r.van_id)}</p>
            <p className="font-semibold">{r.quantity} {unit}</p><p className="text-xs text-gray-500">Reference: {r.reference}</p>
            <RequestProgress status={r.status} hasDiscrepancy={receiptBlocked}/>
            {r.status==='rejected'&&<div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm">
              <strong>Rejection reason:</strong> {r.rejection_reason??'Not recorded (historical request)'}
              <p className="text-xs mt-1">Reviewed by {r.reviewed_by_label}{r.reviewed_at?` · ${new Date(r.reviewed_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}`:''}</p>
            </div>}
            {shortage&&<StatusNotice tone="warning" title="Insufficient warehouse stock"><p>Only {available} {unit} available. The request cannot be issued until warehouse stock is received.</p></StatusNotice>}
            {canApprove&&!completed.includes(requestKey(r))&&r.status==='pending'&&(
              rejectReview===r.id?rejectionReview(r,'mobile')
              :<div className="flex gap-2"><button className="btn btn-primary flex-1 min-h-11" disabled={busy} onClick={()=>act(r.id,'approve')}>Approve</button><button className="btn min-h-11" disabled={busy} onClick={()=>{setRejectReview(r.id);setError('');setSuccess('')}}>Reject</button></div>)}
            {canIssue&&!completed.includes(requestKey(r))&&r.status==='approved'&&<button className="btn btn-primary w-full min-h-11" disabled={busy||!writesEnabled||shortage} onClick={()=>act(r.id,'fulfil')}>Confirm warehouse issue</button>}
            {(canReceive||receiverVanIds.includes(r.van_id))&&!receiptBlocked&&!completed.includes(requestKey(r))&&r.status==='issued'&&(
              receiptReview===r.id?<div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 space-y-2"><p className="text-sm font-semibold">Confirm {r.quantity} {unit} received into {name(vans,r.van_id)}?</p><p className="text-xs">This updates both warehouse and van balances.</p><button className="btn bg-green-700 text-white w-full min-h-11" disabled={busy||!writesEnabled} onClick={()=>receive(r.id)}>Confirm received & move stock</button><button className="btn w-full min-h-11" onClick={()=>setReceiptReview(null)}>Back to edit</button></div>
              :<button className="btn btn-primary w-full min-h-11" disabled={busy||!writesEnabled} onClick={()=>setReceiptReview(r.id)}>Review receiving confirmation</button>
            )}
            {r.status==='issued'&&<WarehouseReceiptExceptionActions requestId={r.id} quantity={r.quantity} unit={unit} discrepancy={r.discrepancy} canReport={canReceive||receiverVanIds.includes(r.van_id)} canResolve={canIssue}/>}
          </article>
        })}
      </div>
      <div className="hidden md:block overflow-x-auto"><table className="w-full"><thead><tr>
      {['Date (Perth)','Warehouse','Van','Product','Qty','Reference','Requested by','Reviewed by','Issued by','Received by','Status','Action'].map(x=><th key={x} className="table-header">{x}</th>)}
    </tr></thead><tbody>{visible.map(r=>{
      const available=Number(balances.find(b=>b.warehouse_id===r.warehouse_id&&b.product_id===r.product_id)?.quantity??0)
      const shortage=r.status==='approved'&&r.quantity>available
      const unit=products.find(p=>p.id===r.product_id)?.unit??'ea'
      return <tr key={r.id} id={`warehouse-request-${r.id}`} className={`${shortage?'bg-amber-50':''} scroll-mt-5`}>
      <td className="table-cell">{new Date(r.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</td>
      <td className="table-cell">{name(warehouses,r.warehouse_id)}</td><td className="table-cell">{name(vans,r.van_id)}</td>
      <td className="table-cell">{name(products,r.product_id)}</td><td className="table-cell">{r.quantity} {unit}<p className={'text-xs mt-1 '+(shortage?'font-semibold text-amber-900':'text-gray-500')}>Warehouse available: {available} {unit}</p>{shortage&&<div className="mt-2"><StatusNotice tone="warning" title="Insufficient warehouse stock"><p>Short by {(r.quantity-available).toLocaleString('en-AU')} {unit}. <a className="underline font-semibold" href="/receive">Receive warehouse stock</a> or wait for replenishment before issuing.</p></StatusNotice></div>}</td>
      <td className="table-cell min-w-52"><span className="font-medium">{r.reference}</span><RequestProgress status={r.status} hasDiscrepancy={Boolean(r.discrepancy&&!r.discrepancy.resolved_at)}/></td><td className="table-cell whitespace-nowrap">{r.requested_by_label}</td><td className="table-cell whitespace-nowrap">{r.reviewed_by_label}</td><td className="table-cell whitespace-nowrap">{r.issued_by_label}</td><td className="table-cell whitespace-nowrap">{r.received_by_label}</td><td className="table-cell"><span className={'rounded-full px-2 py-1 text-xs font-semibold '+(r.status==='fulfilled'?'bg-green-100 text-green-800':r.status==='rejected'?'bg-red-100 text-red-800':'bg-amber-100 text-amber-900')}>{r.status==='issued'?'Awaiting van receipt':r.status==='fulfilled'?'✓ Received':r.status==='approved'?'Approved — ready to issue':r.status==='pending'?'Awaiting review':'Rejected'}</span>{r.status==='rejected'&&<div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs min-w-48"><strong>Reason:</strong> {r.rejection_reason??'Not recorded (historical request)'}{r.reviewed_at&&<p className="mt-1">Reviewed {new Date(r.reviewed_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</p>}</div>}</td>
      <td className="table-cell"><div className="flex gap-1">{canApprove&&!completed.includes(requestKey(r))&&r.status==='pending'&&(rejectReview===r.id?rejectionReview(r,'desktop') :<>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>act(r.id,'approve')}>Approve</button>
        <button type="button" className="btn" disabled={busy} onClick={()=>{setRejectReview(r.id);setError('');setSuccess('')}}>Reject</button>
      </>)}{canIssue&&!completed.includes(requestKey(r))&&r.status==='approved'&&<button type="button" className="btn btn-primary" disabled={busy||!writesEnabled||shortage} onClick={()=>act(r.id,'fulfil')}>{shortage?'Awaiting warehouse stock':'Confirm warehouse issue — no stock movement'}</button>}
      {(canReceive||receiverVanIds.includes(r.van_id))&&!(r.discrepancy&&!r.discrepancy.resolved_at)&&!completed.includes(requestKey(r))&&r.status==='issued'&&
       (receiptReview===r.id?<div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-2 space-y-2 min-w-56"><p className="text-xs font-semibold text-amber-900">Final confirmation — received {r.quantity} stock units into {name(vans,r.van_id)}?</p><p className="text-xs text-amber-900">This will move stock from the warehouse to the van.</p><button type="button" className="btn bg-green-700 text-white" disabled={busy||!writesEnabled} onClick={()=>receive(r.id)}>Confirm received & move stock</button><button type="button" className="btn" disabled={busy} onClick={()=>setReceiptReview(null)}>Back to edit</button></div>
       :<button type="button" className="btn btn-primary" disabled={busy||!writesEnabled} onClick={()=>setReceiptReview(r.id)}>Review receiving confirmation</button>)}
      {r.status==='issued'&&<WarehouseReceiptExceptionActions requestId={r.id} quantity={r.quantity} unit={unit} discrepancy={r.discrepancy} canReport={canReceive||receiverVanIds.includes(r.van_id)} canResolve={canIssue}/>}
      </div></td>
    </tr>})}</tbody></table></div></>}
  </section>
}
