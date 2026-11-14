'use client'
import StatusNotice from './StatusNotice'
import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {saveVehicle,deactivateVehicle,reactivateVehicle} from '@/lib/actions'

type Vehicle={id:string;van_number:string;registration?:string|null;make?:string|null;model?:string|null;colour?:string|null;fuel_type?:string|null;active?:boolean}
const blank={van_number:'',registration:'',make:'',model:'',colour:'',fuel_type:''}
type Form=typeof blank
export default function VehicleRegisterPanel({vans,canEdit}:{vans:Vehicle[];canEdit:boolean}){
  const router=useRouter()
  const [editing,setEditing]=useState<string|null>(null)
  const [form,setForm]=useState<Form>(blank)
  const [message,setMessage]=useState('')
  const [messageError,setMessageError]=useState(false)
  const [pending,start]=useTransition()
  function begin(v?:Vehicle){setEditing(v?.id??'new');setForm(v?{van_number:v.van_number,registration:v.registration??'',make:v.make??'',model:v.model??'',colour:v.colour??'',fuel_type:v.fuel_type??''}:blank);setMessage('');setMessageError(false)}
  function save(){start(async()=>{try{const result=await saveVehicle(editing==='new'?null:editing,form);if(result.error){setMessageError(true);setMessage(result.error)}else{setMessageError(false);setMessage('Vehicle saved.');setEditing(null);router.refresh()}}catch{setMessageError(true);setMessage('Vehicle could not be saved.')}})}
  function deactivate(v:Vehicle){if(!window.confirm(`Deactivate ${v.van_number}? Historical transactions will remain available.`))return
    start(async()=>{try{const result=await deactivateVehicle(v.id);setMessageError(Boolean(result.error));setMessage(result.error??'Vehicle deactivated.');if(!result.error)router.refresh()}catch{setMessageError(true);setMessage('Vehicle could not be deactivated.')}})}
  function reactivate(v:Vehicle){start(async()=>{try{const result=await reactivateVehicle(v.id);setMessageError(Boolean(result.error));setMessage(result.error??'Vehicle reactivated.');if(!result.error)router.refresh()}catch{setMessageError(true);setMessage('Vehicle could not be reactivated.')}})}
  return <section className="card mt-4">
    <div className="flex items-center justify-between gap-2 mb-2"><h2 className="text-sm font-semibold">Vehicle register</h2>{canEdit&&<button type="button" className="btn btn-primary" onClick={()=>begin()}>+ Add vehicle</button>}</div>
    <p className="text-xs text-gray-600 mb-3">Vehicle details identify stock locations. Deactivation preserves history and is blocked until stock and assignments are cleared.</p>
    <div className="overflow-x-auto"><table className="w-full"><thead><tr>{['Van','Registration','Make / model','Colour','Fuel','Status','Actions'].map(h=><th key={h} className="table-header">{h}</th>)}</tr></thead>
      <tbody>{vans.map(v=><tr key={v.id}><td className="table-cell">{v.van_number}</td><td className="table-cell">{v.registration||'—'}</td><td className="table-cell">{[v.make,v.model].filter(Boolean).join(' ')||'—'}</td><td className="table-cell">{v.colour||'—'}</td><td className="table-cell">{v.fuel_type||'—'}</td><td className="table-cell">{v.active===false?'Inactive':'Active'}</td><td className="table-cell whitespace-nowrap">{canEdit&&<div className="flex gap-2"><button type="button" className="btn btn-sm" onClick={()=>begin(v)}>Edit</button>{v.active!==false?<button type="button" className="btn btn-sm" disabled={pending} onClick={()=>deactivate(v)}>Deactivate</button>:<button type="button" className="btn btn-sm" disabled={pending} onClick={()=>reactivate(v)}>Reactivate</button>}</div>}</td></tr>)}</tbody></table></div>
    {editing&&canEdit&&<div className="border border-gray-200 rounded-lg mt-3 p-3 space-y-3"><h3 className="text-sm font-semibold">{editing==='new'?'New vehicle':'Edit vehicle'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{(['van_number','registration','make','model','colour'] as const).map(field=><label key={field} className="form-label">{{van_number:'Van number',registration:'Registration',make:'Make',model:'Model',colour:'Colour'}[field]}<input className="form-input mt-1" value={form[field]} maxLength={field==='van_number'||field==='colour'?40:field==='registration'?20:80} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}/></label>)}
        <label className="form-label">Fuel type<select className="form-input mt-1" value={form.fuel_type} onChange={e=>setForm(f=>({...f,fuel_type:e.target.value}))}><option value="">Not specified</option>{['diesel','petrol','hybrid','electric','lpg','other'].map(x=><option key={x} value={x}>{x}</option>)}</select></label></div>
      <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={pending||!form.van_number.trim()} onClick={save}>{pending?'Saving…':'Save vehicle'}</button><button type="button" className="btn" disabled={pending} onClick={()=>setEditing(null)}>Cancel</button></div>
    </div>}
    {message&&<div className="mt-3"><StatusNotice tone={messageError?'error':'success'} title={messageError?'Vehicle update failed':'Vehicle register updated'}>{message}</StatusNotice></div>}
  </section>
}
