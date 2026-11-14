'use client'

import StatusNotice from './StatusNotice'
import {useState,useTransition} from 'react'
import {saveManagerOperationPermissions} from '@/lib/actions'

type Grants={approve_requests:boolean;issue_warehouse:boolean;receive_returns:boolean;confirm_van_receipt:boolean;adjust_stock:boolean;stocktake_warehouse:boolean;maintain_catalogue:boolean;maintain_vehicles:boolean}
type Entry=Grants&{user_id:string}
const initial:Grants={approve_requests:false,issue_warehouse:false,receive_returns:false,confirm_van_receipt:false,adjust_stock:false,stocktake_warehouse:false,maintain_catalogue:false,maintain_vehicles:false}
function cleanGrants(entry?:Partial<Grants>):Grants {
 return {
  approve_requests:entry?.approve_requests??false,
  issue_warehouse:entry?.issue_warehouse??false,
  receive_returns:entry?.receive_returns??false,
  confirm_van_receipt:entry?.confirm_van_receipt??false,
  adjust_stock:entry?.adjust_stock??false,
  stocktake_warehouse:entry?.stocktake_warehouse??false,
  maintain_catalogue:entry?.maintain_catalogue??false,
  maintain_vehicles:entry?.maintain_vehicles??false,
 }
}
const fields:{key:keyof Grants;label:string}[]=[
 {key:'approve_requests',label:'Approve or reject replenishment requests'},
 {key:'issue_warehouse',label:'Authorise warehouse issues'},
 {key:'confirm_van_receipt',label:'Confirm warehouse issue received into a van'},
 {key:'receive_returns',label:'Accept stock returned from a van'},
 {key:'adjust_stock',label:'Authorise warehouse stock adjustments'},
 {key:'stocktake_warehouse',label:'Approve verified warehouse stocktakes and opening counts'},
 {key:'maintain_catalogue',label:'Maintain products and supplier catalogue'},
 {key:'maintain_vehicles',label:'Maintain vehicle register'},
]
export default function ManagerPermissionsPanel({managers,initialGrants}:{managers:{id:string;full_name:string}[];initialGrants:Entry[]}){
 const [selected,setSelected]=useState(managers[0]?.id??'')
 const [rows,setRows]=useState(initialGrants)
 const [draft,setDraft]=useState<Grants>(()=>cleanGrants(initialGrants.find(x=>x.user_id===managers[0]?.id)))
 const [pending,start]=useTransition()
 const [message,setMessage]=useState('')
 const [messageError,setMessageError]=useState(false)
 function choose(id:string){setSelected(id);setDraft(cleanGrants(rows.find(x=>x.user_id===id)));setMessage('');setMessageError(false)}
 function save(){setMessage('');setMessageError(false);start(async()=>{
  const result=await saveManagerOperationPermissions(selected,cleanGrants(draft))
  if(result.error){setMessageError(true);setMessage(result.error);return}
  setRows(old=>[...old.filter(x=>x.user_id!==selected),{user_id:selected,...draft}])
  setMessage('Manager permission settings saved and audited.')
 })}
 return <section className="card mt-4">
  <h2 className="text-sm font-semibold">Manager permissions</h2>
  <p className="text-xs text-gray-600 mt-1 mb-3">Assign responsibilities independently. Approving, issuing, confirming van receipt, accepting warehouse returns, adjustments and stocktakes have separate permissions. Changes are audited. New grants remain off until explicitly enabled.</p>
  {!managers.length?<p className="text-sm text-gray-600">No Manager accounts exist yet. Permissions can be configured when one is created.</p>:<>
   <label className="form-label" htmlFor="manager-permission-user">Manager</label>
   <select className="form-input max-w-lg mb-3" id="manager-permission-user" value={selected} onChange={e=>choose(e.target.value)}>{managers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(f=><label key={f.key} className="flex items-start gap-2 text-sm border-b pb-2"><input type="checkbox" checked={draft[f.key]} onChange={e=>setDraft(old=>({...old,[f.key]:e.target.checked}))} />{f.label}</label>)}</div>
   {message&&<div className="mt-3"><StatusNotice tone={messageError?'error':'success'} title={messageError?'Manager permissions not saved':'Manager permissions saved'}>{message}</StatusNotice></div>}
   <button type="button" className="btn btn-primary min-h-11 mt-3" disabled={pending} onClick={save}>{pending?'Saving…':'Save Manager permissions'}</button>
  </>}
 </section>
}
