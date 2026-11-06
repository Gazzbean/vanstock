'use client'

import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {requestVanTransfer,decideVanTransfer} from '@/lib/actions'

type Van={id:string;van_number:string}
type Product={id:string;name:string;stock_unit:string|null}
type Balance={van_id:string;product_id:string;quantity:number}
type Request={id:string;source_van_id:string;destination_van_id:string;product_id:string;quantity:number;reason:string;status:string;transaction_reference:string|null;created_at:string;decision_reason:string|null}

export default function VanTransferWorkflow({vans,sources,products,balances,requests,managed,receiverVanIds}:{
 vans:Van[];sources:Van[];products:Product[];balances:Balance[];requests:Request[];
 managed:boolean;receiverVanIds:string[];
}){
 const router=useRouter()
 const [source,setSource]=useState(sources[0]?.id??'')
 const [destination,setDestination]=useState('')
 const [product,setProduct]=useState('')
 const [amount,setAmount]=useState('1')
 const [reason,setReason]=useState('')
 const [decisionNotes,setDecisionNotes]=useState<Record<string,string>>({})
 const [pending,start]=useTransition()
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const sourceBalance=Number(balances.find(b=>b.van_id===source&&b.product_id===product)?.quantity??0)
 const unit=products.find(p=>p.id===product)?.stock_unit??'ea'
 const qty=Number(amount)
 const precisionValid=['kg','m'].includes(unit)
  ?/^\d+(?:\.\d{1,2})?$/.test(amount):/^\d+$/.test(amount)
 const valid=Boolean(source&&destination&&source!==destination&&product&&
  precisionValid&&Number.isFinite(qty)&&qty>0&&qty<=sourceBalance&&reason.trim().length>=3)
 const vanName=(id:string)=>vans.find(v=>v.id===id)?.van_number??'Unknown van'
 const productName=(id:string)=>products.find(p=>p.id===id)?.name??'Unknown product'

 function request(){
  setError('');setMessage('')
  if(!valid){setError('Select two vans, a product, an available quantity and a reason.');return}
  start(async()=>{
   try{
    const result=await requestVanTransfer(source,destination,product,qty,reason)
    if(result.error){setError(result.error);return}
    setMessage('Transfer requested. No stock has moved; the receiving van must confirm it.')
    setAmount('1');setReason('');setProduct('');setDestination('')
    router.refresh()
   }catch{setError('Transfer request status is uncertain. Refresh and check the request list before retrying.')}
  })
 }
 function decide(id:string,approve:boolean,needsManagementReason:boolean){
  setError('');setMessage('')
  const note=(decisionNotes[id]??'').trim()
  if(needsManagementReason&&note.length<3){setError('Management must enter a reason before deciding a transfer for another van.');return}
  start(async()=>{
   try{
    const result=await decideVanTransfer(id,approve,note)
    if(result.error){setError(result.error);return}
    setMessage(approve?`Transfer completed — ${result.reference}. Both van balances have been updated.`:'Transfer rejected. No stock moved.')
    router.refresh()
   }catch{setError('Decision status is uncertain. Refresh and check the request before retrying.')}
  })
 }
 return <div className="space-y-4">
  {error&&<div className="alert alert-danger" role="alert">{error}</div>}
  {message&&<div className="alert alert-success" role="status">{message}</div>}
  <section className="card space-y-3">
   <h2 className="text-base font-semibold">A. Request a transfer</h2>
   <p className="text-sm text-gray-600">Choose the source and receiving vans. The request will remain pending until confirmed.</p>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div><label className="form-label" htmlFor="vt-source">From van</label><select id="vt-source" className="form-input" value={source} onChange={e=>{setSource(e.target.value);setProduct('')}}><option value="">Select source van</option>{sources.map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}</select></div>
    <div><label className="form-label" htmlFor="vt-destination">To van</label><select id="vt-destination" className="form-input" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Select receiving van</option>{vans.filter(v=>v.id!==source).map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}</select></div>
    <div><label className="form-label" htmlFor="vt-product">Product</label><select id="vt-product" className="form-input" value={product} onChange={e=>setProduct(e.target.value)}><option value="">Select product</option>{products.filter(p=>balances.some(b=>b.van_id===source&&b.product_id===p.id&&b.quantity>0)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{product&&<p className="text-xs text-gray-500 mt-1">Available in source van: {sourceBalance} {unit}</p>}</div>
    <div><label className="form-label" htmlFor="vt-qty">Quantity ({unit})</label><input id="vt-qty" className="form-input" type="number" min="0.01" step={['kg','m'].includes(unit)?'0.01':'1'} value={amount} onChange={e=>setAmount(e.target.value)}/></div>
    <div className="md:col-span-2"><label className="form-label" htmlFor="vt-reason">Reason / job reference (required)</label><input id="vt-reason" className="form-input" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Parts needed on Van #4 for job 12345"/></div>
   </div>
   <button className="btn btn-primary" type="button" disabled={!valid||pending} onClick={request}>{pending?'Submitting…':'Request van transfer — no stock movement yet'}</button>
  </section>
  <section className="card space-y-3">
   <h2 className="text-base font-semibold">B. Pending confirmations</h2>
   {requests.filter(r=>r.status==='pending').length===0?<p className="text-sm text-gray-500">No pending transfer requests.</p>:
    requests.filter(r=>r.status==='pending').map(r=>{
     const receiver=receiverVanIds.includes(r.destination_van_id)
     const canDecide=receiver||managed
     const needsReason=!receiver&&managed
     return <div key={r.id} className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
      <p className="text-sm font-semibold">{vanName(r.source_van_id)} → {vanName(r.destination_van_id)} · {r.quantity} {products.find(p=>p.id===r.product_id)?.stock_unit??'ea'} {productName(r.product_id)}</p>
      <p className="text-sm text-gray-700">Reason: {r.reason}</p>
      <p className="text-xs text-amber-900">Awaiting the receiving van's confirmation. Neither balance has changed.</p>
      {canDecide&&<div className="space-y-2">
       <label className="form-label" htmlFor={'vt-decision-'+r.id}>{needsReason?'Management override reason (required)':'Decision note (optional)'}</label>
       <input className="form-input" id={'vt-decision-'+r.id} value={decisionNotes[r.id]??''} maxLength={500} onChange={e=>setDecisionNotes(x=>({...x,[r.id]:e.target.value}))} placeholder={needsReason?'Why are you authorising another van’s transfer?':'Optional explanation'}/>
       <div className="flex gap-2 flex-wrap"><button className="btn btn-primary" type="button" disabled={pending} onClick={()=>decide(r.id,true,needsReason)}>Confirm receipt & move stock</button><button className="btn" type="button" disabled={pending} onClick={()=>decide(r.id,false,needsReason)}>Reject request</button></div>
      </div>}
     </div>
    })}
  </section>
  <section className="card space-y-2">
   <h2 className="text-base font-semibold">C. Recent transfer decisions</h2>
   {requests.filter(r=>r.status!=='pending').length===0?<p className="text-sm text-gray-500">No completed or rejected van transfers yet.</p>:
    requests.filter(r=>r.status!=='pending').slice(0,20).map(r=><div key={r.id} className="border-b border-gray-100 py-2 text-sm">
     <span className="font-medium">{vanName(r.source_van_id)} → {vanName(r.destination_van_id)} · {r.quantity} {productName(r.product_id)}</span>
     <span className={r.status==='completed'?'text-green-700 ml-2':'text-red-700 ml-2'}>{r.status==='completed'?'Completed':'Rejected'}</span>
     <p className="text-xs text-gray-500">{r.transaction_reference??'No stock movement'} · {r.reason}{r.decision_reason?' · '+r.decision_reason:''}</p>
    </div>)}
  </section>
 </div>
}
