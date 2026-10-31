'use client'
import {useState,useTransition} from 'react'
import {issueEstimatedConsumable} from '@/lib/actions'

type Product={id:string;name:string;stock_unit:string|null}
type Stock={product_id:string;quantity:number}
type Group={id:string;name:string;unit:string;quick_1:number;quick_2:number;quick_3:number;quick_4:number}
type Assignment={product_id:string;group_id:string}
export default function EstimatedConsumablesIssue({products,stock,groups,assignments}:{
 products:Product[];stock:Stock[];groups:Group[];assignments:Assignment[]
}){
 const eligible=products.filter(p=>assignments.some(a=>a.product_id===p.id))
 const [productId,setProductId]=useState(eligible[0]?.id??'')
 const [job,setJob]=useState('')
 const [pending,start]=useTransition()
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const [balances,setBalances]=useState(stock)
 const product=eligible.find(p=>p.id===productId)
 const groupId=assignments.find(a=>a.product_id===productId)?.group_id??''
 const group=groups.find(g=>g.id===groupId)
 const choices=group?[group.quick_1,group.quick_2,group.quick_3,group.quick_4].map(Number):[]
 const balance=Number(balances.find(s=>s.product_id===productId)?.quantity??0)
 function issue(quantity:number){
  setMessage('');setError('')
  if(!job.trim()){setError('Enter a ServiceM8 job reference or synthetic test job.');return}
  if(quantity>balance){setError('Insufficient stock. Receive the item into this van before recording usage.');return}
  start(async()=>{
   try{
    const r=await issueEstimatedConsumable(productId,groupId,quantity,job.trim())
    if(r.error){setError(r.error);return}
    setBalances(prev=>[...prev.filter(x=>x.product_id!==productId),{product_id:productId,quantity:balance-quantity}])
    setMessage(quantity+' '+(product?.stock_unit||'ea')+' estimated usage recorded against '+job.trim()+'. ServiceM8 billing unchanged.')
   }catch{setError('Usage could not be confirmed. Refresh stock before retrying.')}
  })
 }
 return <section className="card mt-4">
  <h2 className="text-sm font-medium mb-2">Estimated consumables usage</h2>
  <p className="text-xs text-gray-500 mb-3">Record an estimated quantity using the four Administration presets. This deducts van stock only; no ServiceM8 charge is created.</p>
  {eligible.length?<>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div><label className="form-label" htmlFor="consumable-product">Consumable</label>
     <select id="consumable-product" className="form-input" value={productId} onChange={e=>{setProductId(e.target.value);setError('');setMessage('')}}>
      {eligible.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
     </select></div>
    <div><label className="form-label" htmlFor="consumable-job">Job number / reference</label>
     <input id="consumable-job" className="form-input" placeholder="e.g. TEST-JOB-001" value={job} maxLength={120} onChange={e=>setJob(e.target.value)}/>
    </div>
   </div>
   <p className="text-xs text-gray-600 my-3">Estimated available: <strong>{balance} {product?.stock_unit??'ea'}</strong>{group?' · '+group.name:''}</p>
   <div className="grid grid-cols-4 gap-2">
    {choices.map((q,i)=><button key={i} type="button" className="btn btn-primary" disabled={pending||q>balance||!job.trim()} onClick={()=>issue(q)}>
      {pending?'Saving…':String(q)+' '+(product?.stock_unit??'ea')}
    </button>)}
   </div>
   {error&&<p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
   {message&&<p role="status" className="text-sm text-green-700 mt-3">{message}</p>}
  </>:<p className="text-sm text-gray-500">No consumables have been assigned yet. An Administrator can assign products to groups in Administration. Do not use a cylinder as a test consumable.</p>}
 </section>
}
