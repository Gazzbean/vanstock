'use client'
import {useEffect,useState,useTransition} from 'react'
import {saveVanStockStandard} from '@/lib/actions'

type Product={id:string;name:string;stock_unit:string|null;archived_at:string|null}
type Van={id:string;van_number:string}
type Standard={id:string;van_id:string;product_id:string;classification:string;min_quantity:number;target_quantity:number}
const classes=[
 ['mandatory','Mandatory'],
 ['preferred','Preferred'],
 ['optional','Optional'],
 ['not_assigned','Not assigned'],
] as const
export default function VanStockStandardsPanel({products,vans,standards}:{
 products:Product[];vans:Van[];standards:Standard[]
}){
 const active=products.filter(p=>!p.archived_at)
 const [vanId,setVanId]=useState(vans[0]?.id??'')
 const [productId,setProductId]=useState(active[0]?.id??'')
 const initial=standards.find(s=>s.van_id===vanId&&s.product_id===productId)
 const [classification,setClassification]=useState(initial?.classification??'not_assigned')
 const [minimum,setMinimum]=useState(String(initial?.min_quantity??0))
 const [target,setTarget]=useState(String(initial?.target_quantity??0))
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const [busy,start]=useTransition()
 const product=active.find(p=>p.id===productId)
 const unit=product?.stock_unit??'ea'
 const [saved,setSaved]=useState<Standard[]>(standards)
 function load(v:string,p:string){
  const s=saved.find(row=>row.van_id===v&&row.product_id===p)
  setClassification(s?.classification??'not_assigned')
  setMinimum(String(s?.min_quantity??0));setTarget(String(s?.target_quantity??0))
  setMessage('');setError('')
 }
 function chooseClass(v:string){
  setClassification(v)
  if(v==='optional'||v==='not_assigned'){setMinimum('0');setTarget('0')}
  setMessage('');setError('')
 }
 function save(){
  setMessage('');setError('')
  const min=Number(minimum),max=Number(target)
  if(!vanId||!productId||minimum.trim()===''||target.trim()===''||
     !Number.isFinite(min)||!Number.isFinite(max)||min<0||max<min||
     (unit!=='kg'&&unit!=='m'&&(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)))||
     (['optional','not_assigned'].includes(classification)&&(min!==0||max!==0))){
    setError('Check the quantities: target must be at least minimum. Optional and Not assigned have no routine targets.')
    return
  }
  start(async()=>{
   try{
    const result=await saveVanStockStandard(vanId,productId,classification,min,max)
    if(result.error){setError(result.error);return}
    setSaved(rows=>{
      const other=rows.filter(r=>!(r.van_id===vanId&&r.product_id===productId))
      return [...other,{id:'local',van_id:vanId,product_id:productId,classification,min_quantity:min,target_quantity:max}]
    })
    setMessage('Van stock standard saved. Existing stock quantities are unchanged.')
   }catch{setError('Could not confirm the update. Refresh before retrying.')}
  })
 }
 return <section className="card mt-4">
  <h2 className="text-sm font-medium mb-2">Van stock standards</h2>
  <p className="text-xs text-gray-500 mb-3">Set individual requirements for each van. These settings define stocking targets, not opening balances or automatic stock transfers.</p>
  {active.length&&vans.length ? <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
   <div>
     <label htmlFor="standard-van" className="form-label">Van</label>
     <select id="standard-van" className="form-input" value={vanId} onChange={e=>{setVanId(e.target.value);load(e.target.value,productId)}}>
       {vans.map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}
     </select>
   </div>
   <div>
     <label htmlFor="standard-product" className="form-label">Product</label>
     <select id="standard-product" className="form-input" value={productId} onChange={e=>{setProductId(e.target.value);load(vanId,e.target.value)}}>
       {active.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
   </div>
   <div>
     <label htmlFor="standard-classification" className="form-label">Stock classification</label>
     <select id="standard-classification" className="form-input" value={classification} onChange={e=>chooseClass(e.target.value)}>
       {classes.map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select>
   </div>
   <div>
    <label htmlFor="standard-minimum" className="form-label">Minimum quantity ({unit})</label>
    <input id="standard-minimum" className="form-input" type="number" min="0" step={unit==='kg'||unit==='m'?'0.01':'1'} value={minimum}
      disabled={classification==='optional'||classification==='not_assigned'} onChange={e=>setMinimum(e.target.value)}/>
   </div>
   <div>
    <label htmlFor="standard-target" className="form-label">Target quantity ({unit})</label>
    <input id="standard-target" className="form-input" type="number" min="0" step={unit==='kg'||unit==='m'?'0.01':'1'} value={target}
      disabled={classification==='optional'||classification==='not_assigned'} onChange={e=>setTarget(e.target.value)}/>
   </div>
   <div className="flex items-end"><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy?'Saving standard…':'Save van standard'}</button></div>
  </div>:<p className="text-xs text-gray-500">No vans or active products are available.</p>}
  {(error||message)&&<p role={error?'alert':'status'} className={'text-sm mt-3 '+(error?'text-red-700':'text-green-700')}>{error||message}</p>}
  <p className="text-xs text-gray-500 mt-3">Optional items may still be physically held on a van. Not assigned removes the stocking requirement, not any existing inventory.</p>
 </section>
}
