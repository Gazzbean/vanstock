'use client'
import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {saveStaffInitials,saveUserStatusAndAdmin,saveUserAccessCapabilities} from '@/lib/actions'

type User={id:string;full_name:string;initials:string|null;role:string;is_active:boolean;van_number:string|null}
type Cap={user_id:string;office_access:boolean;technician_access:boolean;receive_stock:boolean;manage_catalogue:boolean;manage_users:boolean}
type Fields={initials:string;active:boolean;tech:boolean;office:boolean;admin:boolean}
export default function UsersAccessPanel({users,capabilities,canEdit}:{users:User[];capabilities:Cap[];canEdit:boolean}){
 const router=useRouter()
 const defaults:Record<string,Fields>=Object.fromEntries(users.map(u=>{
  const cap=capabilities.find(c=>c.user_id===u.id)
  return [u.id,{initials:u.initials??'',active:u.is_active!==false,tech:cap?.technician_access??false,
   office:cap?.office_access??false,admin:u.role==='admin'}]
 }))
 const [draft,setDraft]=useState<Record<string,Fields>>(defaults)
 const [messages,setMessages]=useState<Record<string,string>>({})
 const [pending,start]=useTransition()
 function update(id:string,key:keyof Fields,value:string|boolean){
  setDraft(old=>({...old,[id]:{...old[id],[key]:value}}))
  setMessages(old=>({...old,[id]:''}))
 }
 function save(user:User){
  const v=draft[user.id]
  if(!v)return
  start(async()=>{
   try{
    const old=capabilities.find(x=>x.user_id===user.id)
    const priorInitial=user.initials??''
    if(v.initials!==priorInitial){
     const r=await saveStaffInitials(user.id,v.initials)
     if(r.error){setMessages(m=>({...m,[user.id]:r.error??'Unable to save initials'}));return}
    }
    if(v.tech!==(old?.technician_access??false)||v.office!==(old?.office_access??false)){
     const r=await saveUserAccessCapabilities(user.id,{
      technician_access:v.tech,office_access:v.office,
      receive_stock:v.office?true:(old?.receive_stock??false),
      manage_catalogue:v.admin?true:(old?.manage_catalogue??false),
     })
     if(r.error){setMessages(m=>({...m,[user.id]:r.error??'Unable to save access'}));return}
    }
    if(v.active!==(user.is_active!==false)||v.admin!==(user.role==='admin')){
     const r=await saveUserStatusAndAdmin(user.id,v.active,v.admin)
     if(r.error){setMessages(m=>({...m,[user.id]:r.error??'Unable to save account status'}));return}
    }
    setMessages(m=>({...m,[user.id]:'Saved'}))
    router.refresh()
   }catch{setMessages(m=>({...m,[user.id]:'Could not confirm changes; refresh before trying again'}))}
  })
 }
 return <section className="card">
  <h2 className="text-sm font-semibold mb-1">Users & Access</h2>
  <p className="text-xs text-gray-500 mb-3">Tick multiple responsibilities for one person. Active controls application access. Default and authorised vans are managed below. Initials appear in transaction history.</p>
  <div className="overflow-x-auto"><table className="w-full">
   <thead><tr>
    {['Full name','Initials','Active','Technician','Office','Admin','Default van',...(canEdit?['Action']:[])].map(t=><th key={t} className="table-header">{t}</th>)}
   </tr></thead>
   <tbody>{users.map(u=>{
    const v=draft[u.id]??defaults[u.id]
    return <tr key={u.id}>
     <td className="table-cell whitespace-nowrap font-medium">{u.full_name}</td>
     <td className="table-cell">{canEdit?<input aria-label={'Initials for '+u.full_name} className="form-input w-20 uppercase" maxLength={5}
       value={v.initials} onChange={e=>update(u.id,'initials',e.target.value.toUpperCase())}/>:<strong>{v.initials}</strong>}</td>
     {(['active','tech','office','admin'] as const).map(k=><td key={k} className="table-cell text-center">
      <input type="checkbox" aria-label={k+' for '+u.full_name} checked={v[k]} disabled={!canEdit||pending} onChange={e=>update(u.id,k,e.target.checked)}/>
     </td>)}
     <td className="table-cell whitespace-nowrap text-gray-600">{u.van_number??'None'}</td>
     {canEdit&&<td className="table-cell">
      <button className="btn btn-sm" type="button" disabled={pending||!(/^[A-Z]{2,5}$/.test(v.initials))} onClick={()=>save(u)}>Save</button>
      {messages[u.id]&&<p role="status" className="text-xs mt-1">{messages[u.id]}</p>}
     </td>}
    </tr>
   })}{users.length===0&&<tr><td colSpan={canEdit?8:7} className="table-cell text-gray-500">No users configured.</td></tr>}</tbody>
  </table></div>
  <p className="text-xs text-gray-500 mt-3">Administrative privileges are restricted to authorised administrators. An office user can have no van; an apprentice can have multiple authorised vans without a default.</p>
 </section>
}
