'use client'
import {useState,useTransition} from 'react'
import {saveStaffInitials} from '@/lib/actions'
type User={id:string;full_name:string;initials:string|null;role:string;van_number:string|null}
export default function UsersAccessPanel({users,canEdit}: {users:User[];canEdit:boolean}){
 const [drafts,setDrafts]=useState<Record<string,string>>({})
 const [busy,start]=useTransition()
 const [notice,setNotice]=useState<Record<string,string>>({})
 const roleLabel:Record<string,string>={admin:'Administrator',manager:'Manager',technician:'Technician'}
 function initialsFor(name:string){const parts=name.trim().split(/\s+/);return ((parts[0]?.[0]??'')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase()}
 return <section className="card">
  <h2 className="text-sm font-semibold mb-1">Users & Access</h2>
  <p className="text-xs text-gray-500 mb-3">Initials identify the logged-in person in transaction records. User access role and van allocation are separate. Role and van permissions are not editable in this phase.</p>
  <div className="overflow-x-auto"><table className="w-full"><thead><tr>
   <th className="table-header">Full name</th>
   <th className="table-header">Initials</th>
   <th className="table-header">User access role</th>
   <th className="table-header">Assigned van</th>
   {canEdit&&<th className="table-header">Action</th>}
  </tr></thead><tbody>{users.map(u=>{
   const existing=u.initials??initialsFor(u.full_name)
   const current=drafts[u.id]??existing
   return <tr key={u.id}>
    <td className="table-cell font-medium">{u.full_name}</td>
    <td className="table-cell">
     {canEdit?<input className="form-input w-20 uppercase" aria-label={'Initials for '+u.full_name} maxLength={5} value={current} onChange={e=>setDrafts(d=>({...d,[u.id]:e.target.value.toUpperCase()}))}/>:<strong>{existing}</strong>}
    </td>
    <td className="table-cell">{roleLabel[u.role]??u.role}</td>
    <td className="table-cell text-gray-500">{u.van_number??'Not assigned (office)'}</td>
    {canEdit&&<td className="table-cell">
     <button className="btn btn-sm" type="button" disabled={busy||current===u.initials||!(/^[A-Z]{2,5}$/.test(current))} onClick={()=>start(async()=>{
      const result=await saveStaffInitials(u.id,current)
      setNotice(old=>({...old,[u.id]:result.error??'Saved successfully'}))
     })}>Save</button>
     {notice[u.id]&&<div className="text-xs mt-1" role="status">{notice[u.id]}</div>}
    </td>}
   </tr>
  })}{!users.length&&<tr><td colSpan={canEdit?5:4} className="table-cell text-gray-500">No staff profiles configured.</td></tr>}</tbody></table></div>
  <p className="text-xs text-gray-500 mt-3">An office user may have no van. An administrator can also be assigned a van. Multi-permission access for people with both office and technician duties is the next security phase.</p>
 </section>
}
