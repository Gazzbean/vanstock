'use client'
import StatusNotice from './StatusNotice'
import {useState,useTransition} from 'react'
import {saveUserAccessCapabilities} from '@/lib/actions'
type Cap={user_id:string;office_access:boolean;technician_access:boolean;receive_stock:boolean;manage_catalogue:boolean;manage_users:boolean}
type Staff={id:string;full_name:string;initials:string|null;role:string;van_number:string|null}
const keys=['office_access','technician_access','receive_stock','manage_catalogue'] as const
type Key=typeof keys[number]
const labels:Record<Key,string>={office_access:'Office functions',technician_access:'Technician functions',receive_stock:'Supplier receiving',manage_catalogue:'Catalogue management'}
export default function AccessCapabilitiesPanel({staff,initial,canEdit}:{staff:Staff[];initial:Cap[];canEdit:boolean}){
 const [selected,setSelected]=useState(staff[0]?.id??'')
 const [records,setRecords]=useState(initial)
 const [draft,setDraft]=useState<Record<string,Partial<Record<Key,boolean>>>>({})
 const [pending,start]=useTransition()
 const [notice,setNotice]=useState('')
 const [noticeError,setNoticeError]=useState(false)
 const user=staff.find(s=>s.id===selected)
 const current=records.find(c=>c.user_id===selected)
 const values=Object.fromEntries(keys.map(k=>[k,draft[selected]?.[k]??current?.[k]??false])) as Record<Key,boolean>
 function change(k:Key,v:boolean){setDraft(old=>({...old,[selected]:{...old[selected],[k]:v}}));setNotice('');setNoticeError(false)}
 function submit(){if(!user)return
  setNoticeError(false)
  start(async()=>{
   try{
    const result=await saveUserAccessCapabilities(user.id,values)
    if(result.error){setNoticeError(true);setNotice(result.error);return}
    setRecords(old=>[...old.filter(c=>c.user_id!==user.id),{user_id:user.id,...values,manage_users:current?.manage_users??false}])
    setDraft(old=>({...old,[user.id]:{}}))
    setNotice('Capabilities saved. Receiving and van-stock access use these settings immediately; administrator-only pages still require an administrator role.')
   }catch{setNoticeError(true);setNotice('Unable to save capability plan.')}
  })
 }
 return <section className="card mt-4">
  <h2 className="text-sm font-semibold mb-1">Access capabilities</h2>
  <p className="text-xs text-gray-600 mb-3">Receiving and technician functions are enforced in the database. Office access controls whether receiving can include warehouses and other vans. Catalogue and system administration still require the existing administrator or manager role; changing their capability setting alone does not grant administrator access.</p>
  <div className="max-w-lg space-y-3">
   <div><label htmlFor="cap-user" className="form-label">Staff member</label>
    <select id="cap-user" className="form-input" value={selected} onChange={e=>{setSelected(e.target.value);setNotice('');setNoticeError(false)}}>{staff.map(s=><option key={s.id} value={s.id}>{s.full_name} ({s.initials??'—'})</option>)}</select></div>
   {user&&<p className="text-xs text-gray-500">Current live access: {user.role}. Van: {user.van_number??'Not assigned'}. Capabilities below are separate from this assignment.</p>}
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {keys.map(k=><label key={k} className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={values[k]} onChange={e=>change(k,e.target.checked)} disabled={!canEdit}/>{labels[k]}
    </label>)}
   </div>
   {canEdit&&<button type="button" className="btn btn-primary" disabled={pending||!user} onClick={submit}>{pending?'Saving…':'Save access capabilities'}</button>}
   {notice&&<StatusNotice tone={noticeError?'error':'success'} title={noticeError?'Access capabilities not saved':'Access capabilities saved'}>{notice}</StatusNotice>}
  </div>
 </section>
}
