'use client'

import {useEffect,useRef,useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {requestVanTransfer,decideVanTransfer} from '@/lib/actions'
import {transferStockUnits} from '@/lib/van-transfer-quantities'

type Van={id:string;van_number:string}
type Product={id:string;name:string;stock_unit:string|null}
type Pack={id:string;product_id:string;package_label:string;purchase_unit:string;units_per_package:number}
type Balance={van_id:string;product_id:string;quantity:number}
type Request={id:string;source_van_id:string;destination_van_id:string;product_id:string;quantity:number;reason:string;status:string;transaction_reference:string|null;created_at:string;decision_reason:string|null}

export default function VanTransferWorkflow({vans,sources,products,packages,balances,requests,managed,receiverVanIds}:{
 vans:Van[];sources:Van[];products:Product[];packages:Pack[];balances:Balance[];requests:Request[];
 managed:boolean;receiverVanIds:string[];
}){
 const router=useRouter()
 const [mode,setMode]=useState<'pack'|'loose'>('loose')
 const [source,setSource]=useState(sources[0]?.id??'')
 const [destination,setDestination]=useState('')
 const [product,setProduct]=useState('')
 const [packId,setPackId]=useState('')
 const [amount,setAmount]=useState('1')
 const [reason,setReason]=useState('')
 const [requestReady,setRequestReady]=useState(false)
 const [reviewHighlighted,setReviewHighlighted]=useState(false)
 const [decisionNotes,setDecisionNotes]=useState<Record<string,string>>({})
 const [reviewDecision,setReviewDecision]=useState<{id:string;approve:boolean}|null>(null)
 const [pending,start]=useTransition()
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const requestReviewRef=useRef<HTMLElement>(null)
 const requestFinalRef=useRef<HTMLDivElement>(null)
 const sourceBalance=Number(balances.find(b=>b.van_id===source&&b.product_id===product)?.quantity??0)
 const unit=products.find(p=>p.id===product)?.stock_unit??'ea'
 const chosenPack=packages.find(p=>p.id===packId&&p.product_id===product)
 const matchingPacks=packages.filter(p=>p.product_id===product&&Number(p.units_per_package)>0)
 const amountNumber=Number(amount)
 const stockQty=transferStockUnits(mode,amountNumber,chosenPack?Number(chosenPack.units_per_package):null,unit)
 const wholeUnit=['ea','pack','container','roll'].includes(unit)
 const validAmount=Boolean(amount.trim()&&Number.isFinite(amountNumber)&&amountNumber>0&&
  amountNumber<1000000000&&Math.abs(amountNumber*100-Math.round(amountNumber*100))<1e-7&&
  (mode==='loose'||Number.isInteger(amountNumber)))
 const valid=Boolean(source&&destination&&source!==destination&&product&&validAmount&&
  (mode==='loose'||chosenPack)&&stockQty>0&&stockQty<1000000000&&
  Math.abs(stockQty*100-Math.round(stockQty*100))<1e-7&&
  (!wholeUnit||Number.isInteger(stockQty))&&stockQty<=sourceBalance&&
  reason.trim().length>=3&&reason.trim().length<=350)
 const vanName=(id:string)=>vans.find(v=>v.id===id)?.van_number??'Unknown van'
 const productName=(id:string)=>products.find(p=>p.id===id)?.name??'Unknown product'
 const pendingRequests=requests.filter(r=>r.status==='pending')
 const resolvedRequests=requests.filter(r=>r.status!=='pending')

 useEffect(()=>{
  if(!requestReady)return
  const frame=requestAnimationFrame(()=>{
   requestFinalRef.current?.scrollIntoView({behavior:'smooth',block:'center'})
   requestFinalRef.current?.focus({preventScroll:true})
  })
  return()=>cancelAnimationFrame(frame)
 },[requestReady])
 function changed(){setRequestReady(false);setReviewHighlighted(false);setError('');setMessage('')}
 function changeMode(next:'pack'|'loose'){setMode(next);setAmount('1');setPackId('');changed()}
 function continueToReview(){
  if(!valid||pending)return
  setReviewHighlighted(true)
  requestReviewRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  requestReviewRef.current?.focus({preventScroll:true})
 }
 function reviewRequest(){
  if(!valid||pending)return
  setError('');setRequestReady(true)
 }
 function request(){
  setError('');setMessage('')
  if(!valid||!requestReady){setError('Complete the transfer details and review the request first.');return}
  const packaging=mode==='pack'&&chosenPack
   ?`Full packs: ${amountNumber} × ${chosenPack.units_per_package} ${unit} per ${chosenPack.purchase_unit}. `
   :`Loose items: ${stockQty} ${unit}. `
  start(async()=>{
   try{
    const result=await requestVanTransfer(source,destination,product,stockQty,packaging+reason.trim())
    if(result.error){setError(result.error);return}
    setMessage('Request submitted successfully. No stock has moved; the receiving van must approve it.')
    setRequestReady(false);setReviewHighlighted(false)
    setAmount('1');setReason('');setProduct('');setPackId('');setDestination('')
    router.refresh()
   }catch{setError('Transfer request status is uncertain. Refresh and check pending requests before retrying.')}
  })
 }
 function decide(id:string,approve:boolean,needsManagementReason:boolean){
  setError('');setMessage('')
  const note=(decisionNotes[id]??'').trim()
  if(needsManagementReason&&note.length<3){setError('Management must enter a reason before deciding a transfer for another van.');return}
  if(reviewDecision?.id!==id||reviewDecision.approve!==approve){setReviewDecision({id,approve});return}
  start(async()=>{
   try{
    const result=await decideVanTransfer(id,approve,note)
    if(result.error){setError(result.error);return}
    setReviewDecision(null)
    setMessage(approve?`Transfer completed — ${result.reference}. Both van balances have been updated.`:'Transfer rejected. No stock moved.')
    router.refresh()
   }catch{setError('Decision status is uncertain. Refresh and check the request before retrying.')}
  })
 }
 return <div className="space-y-4">
  {error&&<div className="alert alert-danger" role="alert">{error}</div>}
  {message&&<div className="alert alert-success" role="status">{message}</div>}

  <section className="card space-y-3 border-2 border-green-500">
   <div className="flex items-center justify-between gap-2 flex-wrap">
    <h2 className="text-base font-semibold">A. How are you transferring stock?</h2>
    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">✓ Selected</span>
   </div>
   <p className="text-sm text-gray-600">Select full packs or individual items. Van stock is always recorded in the product's stock unit.</p>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <button type="button" aria-pressed={mode==='pack'} onClick={()=>changeMode('pack')}
     className={'rounded-lg border-2 p-4 text-left '+(mode==='pack'?'border-green-600 bg-green-50':'border-gray-200 bg-white hover:bg-gray-50')}>
     <span className="font-semibold text-sm">📦 Full packs, boxes or cartons</span>
     <p className="text-xs text-gray-600 mt-1">Example: 1 pack of 500 cable ties moves 500 ea.</p>
    </button>
    <button type="button" aria-pressed={mode==='loose'} onClick={()=>changeMode('loose')}
     className={'rounded-lg border-2 p-4 text-left '+(mode==='loose'?'border-green-600 bg-green-50':'border-gray-200 bg-white hover:bg-gray-50')}>
     <span className="font-semibold text-sm">🔩 Individual or loose items</span>
     <p className="text-xs text-gray-600 mt-1">Example: 10 loose cable ties moves 10 ea.</p>
    </button>
   </div>
  </section>

  <section className={'card space-y-3 border-2 '+(valid?'border-amber-500':'border-gray-200')}>
   <div className="flex items-center justify-between gap-2 flex-wrap">
    <h2 className="text-base font-semibold">B. Transfer details</h2>
    {valid&&<span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Ready to review</span>}
   </div>
   <p className="text-sm text-gray-600">Choose the source and receiving vans. The transfer is requested first; no stock moves until the receiving van confirms it.</p>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div><label className="form-label" htmlFor="vt-source">From van *</label><select id="vt-source" className="form-input" value={source} onChange={e=>{setSource(e.target.value);setProduct('');setPackId('');changed()}}><option value="">Select source van</option>{sources.map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}</select></div>
    <div><label className="form-label" htmlFor="vt-destination">To van *</label><select id="vt-destination" className="form-input" value={destination} onChange={e=>{setDestination(e.target.value);changed()}}><option value="">Select receiving van</option>{vans.filter(v=>v.id!==source).map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}</select></div>
    <div className="md:col-span-2"><label className="form-label" htmlFor="vt-product">Product *</label><select id="vt-product" className="form-input" value={product} onChange={e=>{setProduct(e.target.value);setPackId('');changed()}}><option value="">Select product</option>{products.filter(p=>balances.some(b=>b.van_id===source&&b.product_id===p.id&&b.quantity>0)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{product&&<p className="text-xs text-gray-500 mt-1">Recorded source van balance: {sourceBalance} {unit}</p>}</div>
    {mode==='pack'&&<div className="md:col-span-2"><label className="form-label" htmlFor="vt-package">Full pack size *</label><select id="vt-package" className="form-input" value={packId} disabled={!product} onChange={e=>{setPackId(e.target.value);changed()}}><option value="">Select a configured package</option>{matchingPacks.map(p=><option key={p.id} value={p.id}>{p.package_label} — {p.units_per_package} {unit} per {p.purchase_unit}</option>)}</select>{product&&matchingPacks.length===0&&<p className="mt-1 text-sm text-amber-700">No pack conversion is configured for this product. Select loose items or ask an administrator to configure the package.</p>}</div>}
    <div><label className="form-label" htmlFor="vt-qty">{mode==='pack'?'Number of full packs':'Quantity of loose items'} *</label><input id="vt-qty" className="form-input" type="number" min={mode==='pack'||wholeUnit?'1':'0.01'} step={mode==='pack'||wholeUnit?'1':'0.01'} value={amount} onChange={e=>{setAmount(e.target.value);changed()}}/></div>
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-xs text-gray-500">Stock units to transfer</p><p className="text-lg font-semibold">{validAmount&&(mode==='loose'||chosenPack)?stockQty.toLocaleString('en-AU'):'—'} {unit}</p><p className="text-xs text-gray-500">Available: {product?sourceBalance+' '+unit:'Select a product'}</p>{validAmount&&stockQty>sourceBalance&&<p className="text-xs font-semibold text-red-700">Insufficient source van stock</p>}</div>
    <div className="md:col-span-2"><label className="form-label" htmlFor="vt-reason">Reason / job reference (required) *</label><input id="vt-reason" className="form-input" maxLength={350} value={reason} onChange={e=>{setReason(e.target.value);changed()}} placeholder="e.g. Parts needed on Van #4 for job 12345"/></div>
   </div>
   {valid&&!requestReady&&<div className="rounded-lg border border-amber-400 bg-amber-50 p-4 space-y-2" role="status">
    <p className="text-sm font-semibold text-amber-950">Transfer details ready for review — not submitted</p>
    <p className="text-sm text-amber-900">Continue to <strong>C. Review and confirm</strong> to check both vans and the stock quantity.</p>
    <button type="button" className="btn btn-primary" disabled={pending} onClick={continueToReview}>Continue to Review ↓</button>
    <p className="text-xs text-amber-900">This button only opens the review. No request is submitted and no stock moves.</p>
   </div>}
  </section>

  <section ref={requestReviewRef} tabIndex={-1} aria-label="Review transfer request" className={'card space-y-3 border-2 scroll-mt-4 focus:outline-none '+((requestReady||valid)?'border-amber-500':'border-gray-200')+(reviewHighlighted&&!requestReady?' ring-2 ring-amber-300':'')}>
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">C. Review and confirm request</h2><span className={'rounded-full px-3 py-1 text-xs font-semibold '+((requestReady||valid)?'bg-amber-100 text-amber-900':'bg-gray-100 text-gray-600')}>{requestReady?'Stage 2 — Ready to submit':valid?'Stage 1 — Review (not submitted)':'Awaiting transfer details'}</span></div>
   <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2"><p className="text-xs text-gray-500">Stock quantity to transfer</p><p className="text-2xl font-semibold">{valid?stockQty.toLocaleString('en-AU'):'—'} <span className="text-base font-normal">{unit}</span></p><p className="text-sm">{vanName(source)} → {destination?vanName(destination):'Choose receiving van'} · {productName(product)}</p>{mode==='pack'&&chosenPack&&<p className="text-xs text-gray-600">{amountNumber} packs × {chosenPack.units_per_package} {unit} per {chosenPack.purchase_unit}</p>}<div className="border-t border-gray-200 pt-2 text-sm text-gray-600">Current source balance: {product?sourceBalance+' '+unit:'—'} · Expected after approval: {valid?(sourceBalance-stockQty)+' '+unit:'—'}</div></div>
   {requestReady&&valid?<div ref={requestFinalRef} tabIndex={-1} className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 space-y-3 focus:outline-none focus:ring-2 focus:ring-amber-500">
    <p className="font-bold text-amber-950">⚠️ Stage 2 — Action required: request not yet submitted</p>
    <p className="text-sm text-amber-900">Submit this request for the receiving van to confirm. <strong>Neither van balance changes now.</strong></p>
    <div className="flex gap-2 flex-wrap"><button type="button" className="btn bg-green-700 hover:bg-green-800 text-white" disabled={pending} onClick={request}>{pending?'Submitting…':'Confirm & submit transfer request'}</button><button type="button" className="btn" disabled={pending} onClick={()=>setRequestReady(false)}>Back to edit</button></div>
   </div>:<div className="space-y-2"><p className="text-sm text-blue-800">Review the details first. The next step confirms the request, but stock moves only when the receiving van approves it.</p><button type="button" className="btn btn-primary" disabled={!valid||pending} onClick={reviewRequest}>Review request — No stock changes yet</button></div>}
  </section>

  <section className="card space-y-3">
   <h2 className="text-base font-semibold">D. Pending receiving-van confirmations</h2>
   {pendingRequests.length===0?<p className="text-sm text-gray-500">No pending transfer requests.</p>:
    pendingRequests.map(r=>{
     const receiver=receiverVanIds.includes(r.destination_van_id)
     const canDecide=receiver||managed
     const needsReason=!receiver&&managed
     const reviewing=reviewDecision?.id===r.id
     return <div key={r.id} id={`van-transfer-${r.id}`} className={'scroll-mt-5 rounded-lg border-2 p-3 space-y-2 '+(reviewing?'border-amber-500 bg-amber-50':'border-amber-400 bg-amber-50')}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{vanName(r.source_van_id)} → {vanName(r.destination_van_id)} · {r.quantity} {products.find(p=>p.id===r.product_id)?.stock_unit??'ea'} {productName(r.product_id)}</p><span className="rounded-full bg-amber-100 text-amber-900 px-2 py-1 text-xs font-semibold">{reviewing?'Stage 2 — Confirm decision':'Stage 1 — Pending approval'}</span></div>
      <p className="text-sm text-gray-700">Reason: {r.reason}</p>
      <p className="text-xs text-amber-900">Awaiting receiving-van confirmation. Neither balance has changed.</p>
      {canDecide&&<div className="space-y-2">
       <label className="form-label" htmlFor={'vt-decision-'+r.id}>{needsReason?'Management override reason (required)':'Decision note (optional)'}</label>
       <input className="form-input" id={'vt-decision-'+r.id} value={decisionNotes[r.id]??''} maxLength={500} onChange={e=>{setDecisionNotes(x=>({...x,[r.id]:e.target.value}));setReviewDecision(null)}} placeholder={needsReason?'Why are you authorising another van’s transfer?':'Optional explanation'}/>
       {reviewing?<div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 space-y-2" role="group" aria-label="Final transfer decision"><p className="text-sm font-bold text-amber-950">⚠️ Final confirmation required — {reviewDecision.approve?'move '+r.quantity+' stock units':'reject request'}?</p><p className="text-xs text-amber-900">{reviewDecision.approve?'This final click will deduct stock from the source van and add it to the receiving van.':'Rejecting does not change stock.'}</p><div className="flex gap-2 flex-wrap"><button type="button" className="btn bg-green-700 text-white" disabled={pending} onClick={()=>decide(r.id,reviewDecision.approve,needsReason)}>{pending?'Saving…':reviewDecision.approve?'Confirm & move stock':'Confirm rejection'}</button><button type="button" className="btn" onClick={()=>setReviewDecision(null)} disabled={pending}>Back to edit</button></div></div>:<div className="flex gap-2 flex-wrap"><button className="btn btn-primary" type="button" disabled={pending} onClick={()=>decide(r.id,true,needsReason)}>Review receiving confirmation</button><button className="btn" type="button" disabled={pending} onClick={()=>decide(r.id,false,needsReason)}>Review rejection</button></div>}
      </div>}
     </div>
    })}
  </section>

  <section className="card space-y-2">
   <h2 className="text-base font-semibold">E. Recent transfer decisions</h2>
   {resolvedRequests.length===0?<p className="text-sm text-gray-500">No completed or rejected van transfers yet.</p>:
    resolvedRequests.slice(0,20).map(r=><div key={r.id} className="border-b border-gray-100 py-2 text-sm"><span className="font-medium">{vanName(r.source_van_id)} → {vanName(r.destination_van_id)} · {r.quantity} {productName(r.product_id)}</span><span className={r.status==='completed'?'text-green-700 ml-2':'text-red-700 ml-2'}>{r.status==='completed'?'Completed':'Rejected'}</span><p className="text-xs text-gray-500">{r.transaction_reference??'No stock movement'} · {r.reason}{r.decision_reason?' · '+r.decision_reason:''}</p></div>)}
  </section>
 </div>
}
