'use client'
import StatusNotice from './StatusNotice'
import {useState,useTransition} from 'react'
import {saveUserVanAssignments} from '@/lib/actions'
type User={id:string;full_name:string;initials:string|null;van_id:string|null}
type Van={id:string;van_number:string}
type Link={user_id:string;van_id:string}
export default function AuthorizedVansPanel({users,vans,initial,canEdit}:{users:User[];vans:Van[];initial:Link[];canEdit:boolean}){
 const [selected,setSelected]=useState(users[0]?.id??'')
 const [current,setCurrent]=useState(initial)
 const [drafts,setDrafts]=useState<Record<string,{allowed:string[];defaultId:string}>>({})
 const [pending,start]=useTransition()
 const [message,setMessage]=useState('')
 const [messageError,setMessageError]=useState(false)
 const user=users.find(x=>x.id===selected)
 const allowed=drafts[selected]?.allowed??current.filter(r=>r.user_id===selected).map(r=>r.van_id)
 const defaultId=drafts[selected]?.defaultId??user?.van_id??''
 function change(next:string[],defaultValue:string){setDrafts(d=>({...d,[selected]:{allowed:next,defaultId:defaultValue}}));setMessage('');setMessageError(false)}
 function save(){
  if(!user)return
  start(async()=>{
   try{
    const r=await saveUserVanAssignments(user.id,allowed,defaultId||null)
    if(r.error){setMessageError(true);setMessage(r.error);return}
    setCurrent(old=>[...old.filter(x=>x.user_id!==selected),...allowed.map(van_id=>({van_id,user_id:selected}))])
    setMessageError(false);setMessage('Van permissions and default saved. Select a working van on the stock screen to use it.')
   }catch{setMessageError(true);setMessage('Could not save van permissions.')}
  })
 }
 return <section className="card mt-4">
  <h2 className="text-sm font-semibold mb-1">Authorised vans and default van</h2>
  <p className="text-xs text-gray-600 mb-3">Choose which vehicles a technician may work on. Apprentices can have multiple authorised vans and no default. Changing the working van later does not transfer any stock.</p>
  <div className="max-w-xl space-y-3">
   <div><label className="form-label" htmlFor="assignment-staff">Staff member</label>
    <select id="assignment-staff" className="form-input" value={selected} onChange={e=>{setSelected(e.target.value);setMessage('');setMessageError(false)}}>{users.map(u=><option key={u.id} value={u.id}>{u.full_name} ({u.initials??'—'})</option>)}</select></div>
   <div><label className="form-label">Authorised service vans</label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-3">
     {vans.map(v=><label key={v.id} className="text-sm flex items-center gap-2">
      <input type="checkbox" checked={allowed.includes(v.id)} disabled={!canEdit} onChange={e=>{
       const next=e.target.checked?[...allowed,v.id]:allowed.filter(id=>id!==v.id)
       change(next,next.includes(defaultId)?defaultId:'')
      }}/>{v.van_number}
     </label>)}
    </div></div>
   <div><label htmlFor="assignment-default" className="form-label">Default van (optional)</label>
    <select id="assignment-default" className="form-input" disabled={!canEdit} value={defaultId} onChange={e=>change(allowed,e.target.value)}>
     <option value="">None — choose a van when working</option>
     {vans.filter(v=>allowed.includes(v.id)).map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}
    </select>
   </div>
   {canEdit&&<button type="button" className="btn btn-primary" onClick={save} disabled={pending||!user}>{pending?'Saving…':'Save van assignments'}</button>}
   {message&&<StatusNotice tone={messageError?'error':'success'} title={messageError?'Van assignments not saved':'Van assignments saved'}>{message}</StatusNotice>}
  </div>
 </section>
}
