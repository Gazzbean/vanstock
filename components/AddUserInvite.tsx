'use client'
import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {inviteVanStockUser} from '@/lib/actions'

type Van={id:string;van_number:string}
export default function AddUserInvite({vans}:{vans:Van[]}){
 const router=useRouter()
 const [open,setOpen]=useState(false)
 const [name,setName]=useState('')
 const [email,setEmail]=useState('')
 const [initials,setInitials]=useState('')
 const [active,setActive]=useState(true)
 const [technician,setTechnician]=useState(false)
 const [office,setOffice]=useState(true)
 const [role,setRole]=useState<'technician'|'manager'|'admin'>('technician')
 const [allowed,setAllowed]=useState<string[]>([])
 const [defaultId,setDefaultId]=useState('')
 const [message,setMessage]=useState('')
 const [sent,setSent]=useState(false)
 const [pending,start]=useTransition()
 function updateName(v:string){
  setName(v)
  const words=v.trim().split(/\s+/)
  setInitials(words.length>1?((words[0]?.[0]??'')+(words[words.length-1]?.[0]??'')).toUpperCase():'')
 }
 function updateVan(v:string,checked:boolean){
  const next=checked?[...allowed,v]:allowed.filter(id=>id!==v)
  setAllowed(next)
  if(!next.includes(defaultId))setDefaultId('')
 }
 function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setMessage('')
  if(!name.trim().includes(' ')||!email.trim()||!/^[A-Z]{2,5}$/.test(initials)){
   setMessage('Enter a full name, email address and 2–5 letter initials.');return
  }
  start(async()=>{
   try{
    const result=await inviteVanStockUser({
     full_name:name,email,initials,is_active:active,technician,office,role,
     van_ids:technician?allowed:[],default_van_id:technician&&defaultId?defaultId:null,
    })
    if(result.error){setMessage(result.error);return}
    setSent(true)
    setMessage('Invitation sent. The new staff account is configured and will appear in Users & Access.')
    router.refresh()
   }catch{setMessage('Unable to confirm the invitation. Check Supabase users before retrying.')}
  })
 }
 return <>
  <button type="button" className="btn btn-primary btn-sm" onClick={()=>{setOpen(true);setMessage('')}}>+ Add User</button>
  {open&&<div className="modal-overlay" role="presentation" onClick={e=>{if(e.target===e.currentTarget&&!pending)setOpen(false)}}>
   <div className="modal-box max-w-xl w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="invite-user-title">
    <div className="flex justify-between items-center gap-2 mb-3">
     <h2 id="invite-user-title" className="font-semibold">Add user and send invitation</h2>
     <button type="button" aria-label="Close" className="text-gray-500 text-xl" onClick={()=>setOpen(false)}>×</button>
    </div>
    {sent?<div className="space-y-3"><p className="text-sm text-green-700" role="status">{message}</p>
      <button type="button" className="btn btn-primary" onClick={()=>setOpen(false)}>Close</button></div>:
    <form className="space-y-3" onSubmit={submit}>
     <p className="text-xs text-gray-600">An invitation will be emailed by Supabase. The staff member sets their own password. No invitation is sent until you confirm.</p>
     <div><label htmlFor="invite-full-name" className="form-label">Full name *</label>
      <input id="invite-full-name" className="form-input" value={name} onChange={e=>updateName(e.target.value)} required maxLength={120} placeholder="e.g. Ann Parker"/></div>
     <div><label htmlFor="invite-email" className="form-label">Email address *</label>
      <input id="invite-email" className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@company.com.au"/></div>
     <div><label htmlFor="invite-initials" className="form-label">Initials *</label>
      <input id="invite-initials" className="form-input w-24 uppercase" value={initials} onChange={e=>setInitials(e.target.value.toUpperCase())} required maxLength={5}/></div>
     <div>
      <label className="form-label">User access</label>
      <div className="grid grid-cols-2 gap-2">
       <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Active</label>
       <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={technician} onChange={e=>{setTechnician(e.target.checked);if(!e.target.checked){setAllowed([]);setDefaultId('')}}}/>Technician</label>
       <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={office} onChange={e=>setOffice(e.target.checked)}/>Office</label>
       <label className="text-sm flex flex-col gap-1 col-span-2">Base role<select className="form-input" value={role} onChange={e=>setRole(e.target.value as typeof role)}><option value="technician">Technician</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></label>
      </div>
     </div>
     {technician&&<>
      <div><label className="form-label">Authorised vans</label>
       <div className="grid grid-cols-2 gap-2 border border-gray-200 rounded-lg p-3">
        {vans.map(v=><label key={v.id} className="text-xs flex items-center gap-2">
         <input type="checkbox" checked={allowed.includes(v.id)} onChange={e=>updateVan(v.id,e.target.checked)}/>{v.van_number}</label>)}
       </div></div>
      <div><label htmlFor="invite-default-van" className="form-label">Default van (optional)</label>
       <select id="invite-default-van" className="form-input" value={defaultId} onChange={e=>setDefaultId(e.target.value)}>
        <option value="">None — choose a van when working</option>
        {vans.filter(v=>allowed.includes(v.id)).map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}
       </select></div>
     </>}
     {message&&<p role="alert" className="text-sm text-red-700">{message}</p>}
     <div className="flex gap-2 justify-end pt-2">
      <button className="btn" type="button" disabled={pending} onClick={()=>setOpen(false)}>Cancel</button>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending?'Sending…':'Create user & send invitation'}</button>
     </div>
    </form>}
   </div>
  </div>}
 </>
}
