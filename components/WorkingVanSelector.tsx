'use client'
import StatusNotice from './StatusNotice'
import {useState,useTransition} from 'react'
import {usePathname,useSearchParams} from 'next/navigation'
import {setWorkingVanSelection} from '@/lib/actions'
export default function WorkingVanSelector({vans,selectedId,defaultId}:{vans:{id:string;van_number:string}[];selectedId:string|null;defaultId:string|null}){
 const path=usePathname(),params=useSearchParams()
 const [pending,start]=useTransition()
 const [error,setError]=useState('')
 const isDefault=Boolean(selectedId&&defaultId&&selectedId===defaultId)
 const isAlternate=Boolean(selectedId&&selectedId!==defaultId)
 const selectorColour=isDefault
  ? 'bg-green-100 border-green-400 text-green-900'
  : isAlternate ? 'bg-orange-100 border-orange-400 text-orange-900' : 'bg-white'
 return <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mb-4">
  <div className="flex flex-wrap items-center gap-3">
   <label htmlFor="working-van" className="text-sm font-semibold">Working Van</label>
   <select className={`form-input max-w-xs ${selectorColour}`} id="working-van" value={selectedId??''} disabled={pending} onChange={e=>{
    const id=e.target.value
    setError('')
    start(async()=>{
     try{
      const result=await setWorkingVanSelection(id)
      if(result.error){setError(result.error);return}
      const q=new URLSearchParams(params.toString())
      q.delete('van')
      // A complete navigation is deliberate: every server-rendered stock
      // quantity and client-side entry must reload for the newly selected van.
      // A replace + refresh in one React transition can reuse old form props.
      const next=path+(q.size?'?'+q.toString():'')
      if(next===window.location.pathname+window.location.search){
       window.location.reload()
      }else{
       window.location.replace(next)
      }
     }catch{setError('Could not change Working Van. Please retry.')}
    })
   }}>
    <option value="">Select alternate van if listed</option>
    {vans.map(v=><option value={v.id} key={v.id}>{v.van_number}{v.id===defaultId?' (Default)':''}</option>)}
   </select>
   {isDefault&&<span className="text-xs font-medium text-green-800">Default van</span>}
   {isAlternate&&<span className="text-xs font-medium text-orange-800">Alternate van selected</span>}
   {pending&&<span className="text-xs text-blue-800">Switching…</span>}
  </div>
  {error&&<div className="mt-3"><StatusNotice tone="error" title="Working Van not changed">{error}</StatusNotice></div>}
  <p className="text-xs text-gray-600 mt-2">Your Working Van stays selected across pages until you change it or sign out. This does not transfer stock or change your default van. Transactions record your login and the selected van.</p>
 </section>
}
