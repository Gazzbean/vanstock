'use client'

import {useRef,useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {recordJobMaterials,resolveJobMaterialAllocation} from '@/lib/actions'
import {transactionBorder} from '@/lib/transaction-confirmation'
import type {Product,StockItem} from '@/types'

type Line={product_id:string;quantity:string}
type Group={id:string;name:string;quick_1:number;quick_2:number;quick_3:number;quick_4:number}
type Allocation={id:string;van_id:string;product_id:string;quantity:number;job_reference:string;site_location:string;reason:string;created_at:string;status:string}
export default function TransferForm({products,stockItems,selectedVanId,selectedVanNumber,consumables,allocations}:{
 products:Product[];stockItems:StockItem[];selectedVanId:string;selectedVanNumber:string;
 consumables:{assignments:{product_id:string;group_id:string}[];groups:Group[]};allocations:Allocation[];
}){
 const router=useRouter()
 const [mode,setMode]=useState<'used'|'allocated'>('used')
 const [job,setJob]=useState('')
 const [siteLocation,setSiteLocation]=useState('')
 const [reason,setReason]=useState('')
 const [lines,setLines]=useState<Line[]>([{product_id:'',quantity:'1'}])
 const [pending,start]=useTransition()
 const recording=useRef(false)
 const resolving=useRef(new Set<string>())
 const [completed,setCompleted]=useState(false)
 const [resolved,setResolved]=useState<string[]>([])
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const available=(id:string)=>Number(stockItems.find(s=>s.product_id===id)?.quantity??0)
 const unit=(id:string)=>products.find(p=>p.id===id)?.stock_unit??'ea'
 const changed=()=>{setCompleted(false);setError('');setMessage('')}
 const update=(index:number,patch:Partial<Line>)=>{changed();setLines(ls=>ls.map((l,i)=>i===index?{...l,...patch}:l))}
 const validLine=(l:Line)=>{
  const q=Number(l.quantity),u=unit(l.product_id)
  return Boolean(l.product_id&&Number.isFinite(q)&&q>0&&
   (u==='kg'||u==='m'?/^\d+(?:\.\d{1,2})?$/.test(l.quantity):/^\d+$/.test(l.quantity)))
 }
 const totals=new Map<string,number>()
 for(const line of lines)if(validLine(line))totals.set(line.product_id,(totals.get(line.product_id)??0)+Number(line.quantity))
 const ready=Boolean(job.trim()&&lines.length&&lines.every(validLine)&&
   [...totals].every(([id,qty])=>qty<=available(id))&&
   (mode!=='allocated'||(siteLocation.trim()&&reason.trim())))
 function submit(){
  if(pending||recording.current||completed)return
  setError('');setMessage('')
  if(!job.trim()){setError('Enter the job or project number.');return}
  if(mode==='allocated'&&(!siteLocation.trim()||!reason.trim())){setError('Enter where materials were left and why.');return}
  const totals=new Map<string,number>()
  for(const line of lines){
   const quantity=Number(line.quantity)
   const u=unit(line.product_id)
   if(!line.product_id||!Number.isFinite(quantity)||quantity<=0||
     (u==='kg'||u==='m'? !/^\d+(?:\.\d{1,2})?$/.test(line.quantity): !/^\d+$/.test(line.quantity))){
    setError('Enter a valid quantity for every material.');return
   }
   totals.set(line.product_id,(totals.get(line.product_id)??0)+quantity)
  }
  if([...totals].some(([id,qty])=>qty>available(id))){setError('One or more materials exceed the available van quantity.');return}
  recording.current=true
  start(async()=>{
   try{
    const result=await recordJobMaterials({vanId:selectedVanId,jobReference:job.trim(),mode,
     siteLocation:mode==='allocated'?siteLocation:undefined,reason:mode==='allocated'?reason:undefined,
     items:[...totals].map(([product_id,quantity])=>({product_id,quantity}))})
    if(result.error){setError(result.error);return}
    setMessage(mode==='used'?'Materials recorded in VanStock only. Office must check the ServiceM8 job billing.':'Materials allocated on site in VanStock. Confirm later whether used or returned; ServiceM8 billing has not been updated.')
    setCompleted(true)
    router.refresh()
   }catch{setError('Job material status is uncertain. Check VanStock Transaction History before retrying; do not enter a duplicate issue.')}
   finally{recording.current=false}
  })
 }
 function resolve(id:string,resolution:'used'|'returned'){
  if(pending||resolving.current.has(id)||resolved.includes(id))return
  resolving.current.add(id)
  setError('');setMessage('')
  start(async()=>{
   try{
    const r=await resolveJobMaterialAllocation(id,resolution)
    if(r.error){setError(r.error);return}
    setResolved(prev=>[...prev,id])
    setMessage(resolution==='used'?'Allocation marked used. No second van deduction. Office must now check ServiceM8 job billing.':'Unused materials returned to originating van. Office must verify the corresponding ServiceM8 billing is corrected if previously entered.')
    router.refresh()
   }catch{setError('Allocation outcome is uncertain. Check status and stock history before retrying.')}
   finally{resolving.current.delete(id)}
  })
 }
 return <div className="space-y-4">
  <section className={'card border-2 '+transactionBorder(completed?'success':error?'error':pending?'pending':ready?'ready':'idle')}>
   <h2 className="text-sm font-semibold mb-1">Record job materials — {selectedVanNumber}</h2>
   <p className="text-xs text-gray-500 mb-3">Choose what happened to the materials. This records VanStock movements only. It does not add items to the ServiceM8 job or invoice. Use the exact ServiceM8 job number and have Office check billing before approving the invoice.</p>
   {error&&<div role="alert" className="alert alert-danger mb-3">{error}</div>}
   {message&&<div role="status" className="alert alert-success mb-3">{message}</div>}
   <div className="space-y-3">
    <div><label className="form-label">Action</label><select className="form-input" value={mode} onChange={e=>{changed();setMode(e.target.value as 'used'|'allocated')}}>
     <option value="used">Materials Used on Job</option><option value="allocated">Leave Materials on Site (Allocate to Job)</option>
    </select></div>
    <div><label className="form-label">Job / Project Number</label><input className="form-input" value={job} maxLength={120} onChange={e=>{changed();setJob(e.target.value)}} placeholder="Exact ServiceM8 job number"/></div>
    {lines.map((line,i)=>{
     const groupId=consumables.assignments.find(a=>a.product_id===line.product_id)?.group_id
     const group=consumables.groups.find(g=>g.id===groupId)
     return <div key={i} className="border border-gray-200 p-3 rounded-lg space-y-2">
      <div className="flex justify-between"><span className="text-sm font-semibold">Material {i+1}</span>{lines.length>1&&<button type="button" className="text-xs text-red-700" onClick={()=>{changed();setLines(ls=>ls.filter((_,j)=>i!==j))}}>Remove</button>}</div>
      <label className="form-label">Part / Consumable</label>
      <select className="form-input" value={line.product_id} onChange={e=>update(i,{product_id:e.target.value,quantity:'1'})}>
       <option value="">Select material</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({available(p.id)} {p.stock_unit??'ea'} available)</option>)}
      </select>
      <label className="form-label">Quantity used / allocated ({unit(line.product_id)})</label>
      <input className="form-input" type="number" min="0.01" step={['kg','m'].includes(unit(line.product_id))?'0.01':'1'} value={line.quantity} onChange={e=>update(i,{quantity:e.target.value})}/>
      {group&&<div className="flex gap-2 flex-wrap"><span className="text-xs text-gray-500 w-full">Quick quantities</span>{[group.quick_1,group.quick_2,group.quick_3,group.quick_4].map((q,n)=><button key={n} type="button" className="btn btn-sm" onClick={()=>update(i,{quantity:String(q)})}>{q} {unit(line.product_id)}</button>)}</div>}
     </div>
    })}
    <button type="button" className="btn btn-sm" onClick={()=>{changed();setLines(ls=>[...ls,{product_id:'',quantity:'1'}])}} disabled={lines.length>=50}>+ Add another material</button>
    {mode==='allocated'&&<>
     <div><label className="form-label">Where were the materials left on site? (required)</label><input className="form-input" value={siteLocation} maxLength={500} onChange={e=>{changed();setSiteLocation(e.target.value)}} placeholder="e.g. Plant room, beside AHU-03"/></div>
     <div><label className="form-label">Why were they left there? (required)</label><textarea className="form-input" value={reason} maxLength={1000} onChange={e=>{changed();setReason(e.target.value)}} placeholder="e.g. Waiting for shutdown approval"/></div>
    </>}
    {ready&&!completed&&!pending&&!error&&<div className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 p-3" role="status">
      <p className="text-sm font-semibold text-amber-900">Ready to confirm — review VanStock deduction</p>
      <p className="text-xs text-amber-900">Job {job.trim()} · {selectedVanNumber} · {mode==='allocated'?'Allocated on site':'Used on job'} · {[...totals].map(([id,q])=>`${q} ${unit(id)} ${products.find(p=>p.id===id)?.name??'material'}`).join(' · ')}</p>
      <p className="text-xs text-amber-900 mt-1">No ServiceM8 billing entry or invoice item will be created.</p>
    </div>}
    <button className="btn btn-primary w-full justify-center mt-3" disabled={!ready||pending||completed} onClick={submit}>{completed?'Recorded in VanStock':pending?'Recording…':mode==='used'?'Record Materials Used':'Allocate Materials to Job'}</button>
   </div>
  </section>
  <section className="card"><h2 className="text-sm font-semibold mb-2">Materials currently left on site</h2>
   {!allocations.length?<p className="text-sm text-gray-500">No outstanding allocations for this van.</p>:allocations.map(a=><div key={a.id} className="border-b border-gray-100 py-3">
    <p className="text-sm font-medium">{products.find(p=>p.id===a.product_id)?.name??'Material'} — {a.quantity} {unit(a.product_id)} · {a.job_reference}</p>
    <p className="text-xs text-gray-600">Location: {a.site_location}</p><p className="text-xs text-gray-600">Reason: {a.reason}</p>
    <div className="flex gap-2 mt-2"><button className="btn btn-sm" disabled={pending||resolved.includes(a.id)} onClick={()=>resolve(a.id,'used')}>Mark as Used</button><button className="btn btn-sm" disabled={pending||resolved.includes(a.id)} onClick={()=>resolve(a.id,'returned')}>Return to Van</button></div>
   </div>)}
  </section>
 </div>
}
