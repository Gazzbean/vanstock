'use client'

import {useEffect,useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {processWarehouseRequest,confirmWarehouseReceipt} from '@/lib/actions'

type Request={id:string;warehouse_id:string;van_id:string;product_id:string;quantity:number;reference:string;status:string;created_at:string;requested_by_label:string;reviewed_by_label:string;fulfilled_by_label:string;issued_by_label:string;received_by_label:string}

export default function WarehouseRequestQueue({requests,warehouses,vans,products,canManage,canApprove=canManage,canIssue=canManage,canReceive=canManage,writesEnabled,receiverVanIds=[],balances=[]}:{
  requests:Request[];warehouses:{id:string;name:string}[];
  vans:{id:string;van_number:string}[];products:{id:string;name:string;unit:string}[];
  canManage:boolean;canApprove?:boolean;canIssue?:boolean;canReceive?:boolean;writesEnabled:boolean;receiverVanIds?:string[];
  balances?:{warehouse_id:string;product_id:string;quantity:number}[]
}){
  const [busy,start]=useTransition()
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [completed,setCompleted]=useState<string[]>([])
  const [receiptReview,setReceiptReview]=useState<string|null>(null)
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
  function act(id:string,action:'approve'|'reject'|'fulfil'){
    setError('');setSuccess('')
    start(async()=>{
      try{
        const result=await processWarehouseRequest(id,action)
        if(result.error)setError(result.error)
        else{setCompleted(prev=>[...prev,id]);setSuccess('Request updated successfully.');router.refresh()}
      }catch{setError('Request could not be processed. Refresh before retrying.')}
    })
  }
  function receive(id:string){
    setError('');setSuccess('')
    start(async()=>{
      try{
        const result=await confirmWarehouseReceipt(id)
        if(result.error)setError(result.error)
        else{setCompleted(prev=>[...prev,id]);setReceiptReview(null);setSuccess('Receipt confirmed. Warehouse and van balances have been updated.');router.refresh()}
      }catch{setError('Receipt status is uncertain. Refresh and check the request before retrying.')}
    })
  }
  return <section id="warehouse-requests" className="card mt-4 scroll-mt-4">
    <h2 className="text-sm font-medium mb-2">{canManage?'Warehouse replenishment requests':'My warehouse replenishment requests'}</h2>
    <p className="text-xs text-gray-500 mb-3">Warehouse approval and issue do not move stock. Both balances change only when the receiving van confirms receipt.</p>
    <div className="mb-3"><label className="form-label" htmlFor="warehouse-request-filter">Show requests</label><select id="warehouse-request-filter" className="form-input max-w-xs" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="open">Pending, approved & awaiting receipt</option><option value="all">All requests</option><option value="fulfilled">Received</option><option value="rejected">Rejected</option></select></div>
    {error&&<p role="alert" className="text-sm text-red-700 mb-2">{error}</p>}
    {success&&<p role="status" className="text-sm text-green-700 mb-2">{success}</p>}
    {visible.length===0?<p className="text-sm text-gray-500">No requests match this filter.</p>:<>
      <div className="md:hidden space-y-3">
        {visible.map(r=>{
          const unit=products.find(p=>p.id===r.product_id)?.unit??'ea'
          const available=Number(balances.find(b=>b.warehouse_id===r.warehouse_id&&b.product_id===r.product_id)?.quantity??0)
          const shortage=r.status==='approved'&&r.quantity>available
          return <article id={`warehouse-request-mobile-${r.id}`} key={r.id} className="rounded-xl border-2 border-amber-200 p-3 space-y-3">
            <div className="flex items-start justify-between gap-2"><strong className="text-sm">{name(products,r.product_id)}</strong><span className="text-xs rounded-full bg-amber-100 text-amber-900 px-2 py-1">{r.status==='issued'?'Awaiting receipt':r.status==='approved'?'Ready to issue':r.status==='pending'?'Awaiting approval':r.status==='fulfilled'?'Received':'Rejected'}</span></div>
            <p className="text-sm">{name(warehouses,r.warehouse_id)} → {name(vans,r.van_id)}</p>
            <p className="font-semibold">{r.quantity} {unit}</p><p className="text-xs text-gray-500">Reference: {r.reference}</p>
            <div className="grid grid-cols-4 gap-1 text-[11px] text-center">{['Requested','Approved','Issued','Received'].map((stage,i)=>{
              const at=r.status==='rejected'?-1:r.status==='pending'?0:r.status==='approved'?1:r.status==='issued'?2:3
              return <span key={stage} className={`rounded p-1 ${i<at?'bg-green-100 text-green-800':i===at?'bg-amber-100 text-amber-900':'bg-gray-100 text-gray-500'}`}>{i<at?'✓ ':''}{stage}</span>
            })}</div>
            {shortage&&<p role="alert" className="text-sm text-red-700">Insufficient warehouse stock: {available} {unit} available.</p>}
            {canApprove&&!completed.includes(r.id)&&r.status==='pending'&&<div className="flex gap-2"><button className="btn btn-primary flex-1 min-h-11" disabled={busy} onClick={()=>act(r.id,'approve')}>Approve</button><button className="btn min-h-11" disabled={busy} onClick={()=>act(r.id,'reject')}>Reject</button></div>}
            {canIssue&&!completed.includes(r.id)&&r.status==='approved'&&<button className="btn btn-primary w-full min-h-11" disabled={busy||!writesEnabled||shortage} onClick={()=>act(r.id,'fulfil')}>Confirm warehouse issue</button>}
            {(canReceive||receiverVanIds.includes(r.van_id))&&!completed.includes(r.id)&&r.status==='issued'&&(
              receiptReview===r.id?<div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 space-y-2"><p className="text-sm font-semibold">Confirm {r.quantity} {unit} received into {name(vans,r.van_id)}?</p><p className="text-xs">This updates both warehouse and van balances.</p><button className="btn bg-green-700 text-white w-full min-h-11" disabled={busy||!writesEnabled} onClick={()=>receive(r.id)}>Confirm received & move stock</button><button className="btn w-full min-h-11" onClick={()=>setReceiptReview(null)}>Back to edit</button></div>
              :<button className="btn btn-primary w-full min-h-11" disabled={busy||!writesEnabled} onClick={()=>setReceiptReview(r.id)}>Review receiving confirmation</button>
            )}
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
      <td className="table-cell">{name(products,r.product_id)}</td><td className="table-cell">{r.quantity} {unit}<p className={'text-xs mt-1 '+(shortage?'font-semibold text-amber-900':'text-gray-500')}>Warehouse available: {available} {unit}</p>{shortage&&<div className="mt-2 rounded-lg border-2 border-amber-500 bg-amber-50 p-2 text-xs text-amber-950" role="alert"><strong>⚠ Insufficient warehouse stock.</strong> Short by {(r.quantity-available).toLocaleString('en-AU')} {unit}. <a className="underline font-semibold" href="/receive">Receive warehouse stock</a> or wait for replenishment before issuing.</div>}</td>
      <td className="table-cell">{r.reference}</td><td className="table-cell whitespace-nowrap">{r.requested_by_label}</td><td className="table-cell whitespace-nowrap">{r.reviewed_by_label}</td><td className="table-cell whitespace-nowrap">{r.issued_by_label}</td><td className="table-cell whitespace-nowrap">{r.received_by_label}</td><td className="table-cell"><span className={'rounded-full px-2 py-1 text-xs font-semibold '+(r.status==='fulfilled'?'bg-green-100 text-green-800':r.status==='rejected'?'bg-red-100 text-red-800':'bg-amber-100 text-amber-900')}>{r.status==='issued'?'Awaiting van receipt':r.status==='fulfilled'?'✓ Received':r.status==='approved'?'Approved — ready to issue':r.status==='pending'?'Awaiting review':'Rejected'}</span></td>
      <td className="table-cell"><div className="flex gap-1">{canApprove&&!completed.includes(r.id)&&r.status==='pending'&&<>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>act(r.id,'approve')}>Approve</button>
        <button type="button" className="btn" disabled={busy} onClick={()=>act(r.id,'reject')}>Reject</button>
      </>}{canIssue&&!completed.includes(r.id)&&r.status==='approved'&&<button type="button" className="btn btn-primary" disabled={busy||!writesEnabled||shortage} onClick={()=>act(r.id,'fulfil')}>{shortage?'Awaiting warehouse stock':'Confirm warehouse issue — no stock movement'}</button>}
      {(canReceive||receiverVanIds.includes(r.van_id))&&!completed.includes(r.id)&&r.status==='issued'&&
       (receiptReview===r.id?<div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-2 space-y-2 min-w-56"><p className="text-xs font-semibold text-amber-900">Final confirmation — received {r.quantity} stock units into {name(vans,r.van_id)}?</p><p className="text-xs text-amber-900">This will move stock from the warehouse to the van.</p><button type="button" className="btn bg-green-700 text-white" disabled={busy||!writesEnabled} onClick={()=>receive(r.id)}>Confirm received & move stock</button><button type="button" className="btn" disabled={busy} onClick={()=>setReceiptReview(null)}>Back to edit</button></div>
       :<button type="button" className="btn btn-primary" disabled={busy||!writesEnabled} onClick={()=>setReceiptReview(r.id)}>Review receiving confirmation</button>)}
      </div></td>
    </tr>})}</tbody></table></div></>}
  </section>
}
