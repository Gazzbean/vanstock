'use client'

import {useState,useTransition} from 'react'
import {saveManagerOperationPermissions} from '@/lib/actions'

type Grants={approve_requests:boolean;issue_warehouse:boolean;receive_returns:boolean;adjust_stock:boolean;maintain_catalogue:boolean;maintain_vehicles:boolean}
type Entry=Grants&{user_id:string}
const initial:Grants={approve_requests:false,issue_warehouse:false,receive_returns:false,adjust_stock:false,maintain_catalogue:false,maintain_vehicles:false}
const fields:{key:keyof Grants;label:string}[]=[
 {key:'approve_requests',label:'Approve or reject replenishment requests'},
 {key:'issue_warehouse',label:'Authorise warehouse issues'},
 {key:'receive_returns',label:'Receive warehouse returns'},
 {key:'adjust_stock',label:'Approve stock adjustments and stocktakes'},
 {key:'maintain_catalogue',label:'Maintain products and supplier catalogue'},
 {key:'maintain_vehicles',label:'Maintain vehicle register'},
]
export default function ManagerPermissionsPanel({managers,initialGrants}:{managers:{id:string;full_name:string}[];initialGrants:Entry[]}){
 const [selected,setSelected]=useState(managers[0]?.id??'')
 const [rows,setRows]=useState(initialGrants)
 const [draft,setDraft]=useState<Grants>(()=>({...initial,...initialGrants.find(x=>x.user_id===managers[0]?.id)}))
 const [pending,start]=useTransition()
 const [message,setMessage]=useState('')
 function choose(id:string){setSelected(id);setDraft({...initial,...rows.find(x=>x.user_id===id)});setMessage('')}
 function save(){setMessage('');start(async()=>{
  const result=await saveManagerOperationPermissions(selected,draft)
  if(result.error){setMessage(result.error);return}
  setRows(old=>[...old.filter(x=>x.user_id!==selected),{user_id:selected,...draft}])
  setMessage('Manager permission settings saved and audited.')
 })}
 return <section className="card mt-4">
  <h2 className="text-sm font-semibold">Manager permissions</h2>
  <p className="text-xs text-gray-600 mt-1 mb-3">Assign individual operating responsibilities to Managers. Changes are audited. Warehouse operations and application catalogue/vehicle controls follow these grants.</p>
  {!managers.length?<p className="text-sm text-gray-600">No Manager accounts exist yet. Permissions can be configured when one is created.</p>:<>
   <label className="form-label" htmlFor="manager-permission-user">Manager</label>
   <select className="form-input max-w-lg mb-3" id="manager-permission-user" value={selected} onChange={e=>choose(e.target.value)}>{managers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(f=><label key={f.key} className="flex items-start gap-2 text-sm border-b pb-2"><input type="checkbox" checked={draft[f.key]} onChange={e=>setDraft(old=>({...old,[f.key]:e.target.checked}))} />{f.label}</label>)}</div>
   {message&&<p role="status" className="text-sm mt-3">{message}</p>}
   <button type="button" className="btn btn-primary min-h-11 mt-3" disabled={pending} onClick={save}>{pending?'Saving…':'Save Manager permissions'}</button>
  </>}
 </section>
}
