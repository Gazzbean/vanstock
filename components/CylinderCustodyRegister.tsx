'use client'
import {useRef,useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {saveCylinderCustody} from '@/lib/actions'
import {
 cylinderDueLabels,validateCylinderInput,
 type CylinderInput,type CylinderOwner,type CylinderLocation,type CylinderStatus,
} from '@/lib/cylinder-custody'
import {transactionBorder} from '@/lib/transaction-confirmation'
type Option={id:string;name?:string;van_number?:string;active?:boolean}
type Row=Omit<CylinderInput,'nominal_capacity_kg'|'supplier_id'|'warehouse_id'|'van_id'|'site_reference'|'rent_free_until'|'return_due_on'|'rental_review_on'|'rental_terms_reference'|'cylinder_test_due_on'|'last_leak_check_on'|'notes'>&{id:string;version:number;updated_at:string;
 nominal_capacity_kg:number|null;
 supplier_id:string|null;warehouse_id:string|null;van_id:string|null;site_reference:string|null;
 rent_free_until:string|null;return_due_on:string|null;rental_review_on:string|null;
 rental_terms_reference:string|null;cylinder_test_due_on:string|null;last_leak_check_on:string|null;
 notes:string|null;audit_reference:string}
type Props={records:Row[];suppliers:Option[];warehouses:Option[];vans:Option[];canEdit:boolean;perthDay:string}
const empty=():CylinderInput=>({
 cylinder_serial:'',gas_label:'',nominal_capacity_kg:'',
 ownership:'' as CylinderOwner,supplier_id:'',received_on:'',
 rent_free_until:'',return_due_on:'',rental_review_on:'',rental_terms_reference:'',
 cylinder_test_due_on:'',last_leak_check_on:'',
 status:'in_custody',location_kind:'' as CylinderLocation,
 warehouse_id:'',van_id:'',site_reference:'',notes:'',audit_reference:'',
})
const dates=(x:string|null|undefined)=>x??''
const value=(s:string|null|undefined)=>s??''
const pretty=(s:string)=>s.replaceAll('_',' ')
const opts=(xs:Option[],label:(o:Option)=>string)=>
 xs.map(x=><option key={x.id} value={x.id}>{label(x)}</option>)

export default function CylinderCustodyRegister({records,suppliers,warehouses,vans,canEdit,perthDay}:Props){
 const router=useRouter()
 const [editing,setEditing]=useState(false)
 const [form,setForm]=useState<CylinderInput>(empty())
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [completed,setCompleted]=useState(false)
 const [pending,start]=useTransition()
 const lock=useRef(false)
 const [showAll,setShowAll]=useState(false)
 const set=<K extends keyof CylinderInput>(key:K,v:CylinderInput[K])=>{
  setForm(x=>({...x,[key]:v,
    ...(key==='location_kind'?{warehouse_id:'',van_id:'',site_reference:''}:{})}))
  setError('');setSuccess('');setCompleted(false)
 }
 const canSave=Boolean(!('error' in validateCylinderInput(form)))
 const visible=records.filter(r=>showAll||r.status!=='returned')
 const labelLocation=(r:Row)=>{
  if(r.location_kind==='warehouse')return warehouses.find(w=>w.id===r.warehouse_id)?.name??'Warehouse (unknown)'
  if(r.location_kind==='van')return vans.find(v=>v.id===r.van_id)?.van_number??'Van (unknown)'
  if(r.location_kind==='customer_site')return r.site_reference||'Customer site'
  if(r.location_kind==='supplier')return 'Returned to supplier'
  return 'Unverified'
 }
 const labelSupplier=(id:string|null)=>suppliers.find(s=>s.id===id)?.name??(id?'Supplier not in current list':'—')
 const edit=(row:Row)=>{
  const fields:CylinderInput={
   ...row,nominal_capacity_kg:row.nominal_capacity_kg?.toString()??'',
   supplier_id:value(row.supplier_id),warehouse_id:value(row.warehouse_id),van_id:value(row.van_id),
   site_reference:value(row.site_reference),rent_free_until:dates(row.rent_free_until),
   return_due_on:dates(row.return_due_on),rental_review_on:dates(row.rental_review_on),
   rental_terms_reference:value(row.rental_terms_reference),
   cylinder_test_due_on:dates(row.cylinder_test_due_on),last_leak_check_on:dates(row.last_leak_check_on),
   notes:value(row.notes),audit_reference:'',
  }
  setForm(fields);setEditing(true);setError('');setSuccess('');setCompleted(false)
  document.getElementById('cylinder-form')?.scrollIntoView({block:'start',behavior:'smooth'})
 }
 const fresh=()=>{setForm(empty());setEditing(true);setError('');setSuccess('');setCompleted(false)}
 const submit=()=>{
  if(!canSave||pending||lock.current||completed)return
  lock.current=true;setError('');setSuccess('')
  start(async()=>{
   try{
    const result=await saveCylinderCustody(form)
    if(result.error)setError(result.error)
    else{
     setCompleted(true);setSuccess(form.id
       ?'Cylinder custody change recorded with its reference and immutable history.'
       :'Cylinder registered. Verify the physical serial and location before relying on this entry.')
     router.refresh()
    }
   }catch{
    setError('The operation could not be confirmed. Refresh the register and history before retrying.')
   }finally{lock.current=false}
  })
 }
 return <div className="space-y-4">
  <section className="card">
   <div className="flex flex-wrap justify-between items-center gap-3">
    <div>
     <h2 className="font-semibold text-sm">Physical cylinder register</h2>
     <p className="text-xs text-gray-500 mt-1">Serial-level custody only. A cylinder is one asset, not kilograms of refrigerant or a VanStock stock deduction.</p>
    </div>
    <div className="flex gap-2 items-center">
     <label className="text-sm"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> Show returned</label>
     {canEdit&&<button type="button" className="btn btn-primary" onClick={fresh}>Register cylinder</button>}
    </div>
   </div>
   {!records.length&&<p className="text-sm text-amber-800 mt-4">No cylinders are registered yet. This does not mean the warehouse or vans are physically empty; count and verify serials before initial entry.</p>}
   {records.length>0&&<div className="overflow-x-auto mt-3">
    <table className="w-full">
     <thead><tr>{['Cylinder / gas','Supplier / owner','Capacity','Location','Custody','Supplier dates / inspection',''].map(h=><th key={h} className="table-header">{h}</th>)}</tr></thead>
     <tbody>{visible.map(r=>{
      const alerts=cylinderDueLabels(r,perthDay)
      return <tr key={r.id} className="border-t">
       <td className="table-cell"><div className="font-semibold">{r.cylinder_serial}</div><div className="text-xs text-gray-600">{r.gas_label}</div></td>
       <td className="table-cell text-sm">{pretty(r.ownership)}<div className="text-xs text-gray-500">{labelSupplier(r.supplier_id)}</div></td>
       <td className="table-cell text-sm">{r.nominal_capacity_kg===null?'—':r.nominal_capacity_kg+' kg (nominal)'}</td>
       <td className="table-cell text-sm">{labelLocation(r)}</td>
       <td className="table-cell text-sm">{pretty(r.status)}</td>
       <td className="table-cell text-xs">
        {r.rent_free_until&&<div>Rent-free to {r.rent_free_until}</div>}
        {r.return_due_on&&<div>Return by {r.return_due_on}</div>}
        {r.rental_review_on&&<div>Hire terms review {r.rental_review_on}</div>}
        {r.cylinder_test_due_on&&<div>Cylinder test due {r.cylinder_test_due_on}</div>}
        {alerts.filter(a=>a.due).map(a=><div key={a.text} className="font-semibold text-red-700">{a.text}</div>)}
        {!alerts.length&&'No due dates recorded'}
       </td>
       <td className="table-cell">{canEdit&&<button type="button" className="text-sm text-blue-700 underline" onClick={()=>edit(r)}>Edit / transfer</button>}</td>
      </tr>})}</tbody>
    </table>
   </div>}
  </section>
  {canEdit&&editing&&<section id="cylinder-form" className={'card border-2 '+transactionBorder(completed?'success':error?'error':pending?'pending':canSave?'ready':'idle')}>
   <div className="flex justify-between gap-2"><h2 className="font-semibold text-sm">{form.id?'Update custody / hire terms':'Register physical cylinder'}</h2>
    <button type="button" className="text-sm text-blue-700 underline" onClick={()=>setEditing(false)}>Close</button></div>
   <p className="text-xs text-gray-500 mt-1">Only enter cylinders verified in your custody. Never assume supplier ownership, hire dates or refrigerant remaining from the cylinder size.</p>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
    <label className="text-sm">Cylinder serial *
     <input className="form-input mt-1" value={form.cylinder_serial} onChange={e=>set('cylinder_serial',e.target.value)} maxLength={120} placeholder="Stamped serial number"/></label>
    <label className="text-sm">Gas / refrigerant type *
     <input className="form-input mt-1" value={form.gas_label} onChange={e=>set('gas_label',e.target.value)} maxLength={100} placeholder="e.g. R134a or Oxygen"/></label>
    <label className="text-sm">Ownership *
     <select className="form-input mt-1" value={form.ownership} onChange={e=>set('ownership',e.target.value as CylinderOwner)}>
      <option value="">Select ownership</option><option value="supplier">Supplier-owned</option><option value="company">Company-owned</option><option value="customer">Customer-owned</option>
     </select></label>
    <label className="text-sm">Registered supplier {form.ownership==='supplier'?'*':''}
     <select className="form-input mt-1" value={form.supplier_id} onChange={e=>set('supplier_id',e.target.value)}>
      <option value="">Select supplier (if applicable)</option>{opts(suppliers,x=>(x.name??'Supplier')+(!x.active?' (inactive)':''))}
     </select></label>
    <label className="text-sm">Nominal cylinder capacity (kg, if applicable)
     <input className="form-input mt-1" type="number" min="0.01" step="0.01" value={form.nominal_capacity_kg} onChange={e=>set('nominal_capacity_kg',e.target.value)} placeholder="e.g. 12 / 22 / 65"/></label>
    <label className="text-sm">Date received into custody *
     <input className="form-input mt-1" type="date" value={form.received_on} onChange={e=>set('received_on',e.target.value)}/></label>
    <label className="text-sm">Status *
     <select className="form-input mt-1" value={form.status} onChange={e=>set('status',e.target.value as CylinderStatus)}>
      <option value="in_custody">In custody</option><option value="return_pending">Return pending</option><option value="returned">Returned to supplier</option><option value="unaccounted">Unaccounted (investigation)</option>
     </select></label>
    <label className="text-sm">Current physical location *
     <select className="form-input mt-1" value={form.location_kind} onChange={e=>set('location_kind',e.target.value as CylinderLocation)}>
      <option value="">Select location type</option><option value="warehouse">Warehouse</option><option value="van">Van</option><option value="customer_site">Customer/job site</option><option value="supplier">Supplier (returned)</option><option value="unknown">Unknown / investigation</option>
     </select></label>
    {form.location_kind==='warehouse'&&<label className="text-sm">Warehouse *
     <select className="form-input mt-1" value={form.warehouse_id} onChange={e=>set('warehouse_id',e.target.value)}>
      <option value="">Select warehouse</option>{opts(warehouses,x=>x.name??'Warehouse')}
     </select></label>}
    {form.location_kind==='van'&&<label className="text-sm">Van *
     <select className="form-input mt-1" value={form.van_id} onChange={e=>set('van_id',e.target.value)}>
      <option value="">Select van</option>{opts(vans.filter(x=>x.active),x=>x.van_number??'Van')}
     </select></label>}
    {form.location_kind==='customer_site'&&<label className="text-sm">Customer site / job *
     <input className="form-input mt-1" value={form.site_reference} onChange={e=>set('site_reference',e.target.value)} maxLength={250} placeholder="Job or site location"/></label>}
    <label className="text-sm">Supplier rent-free until
     <input className="form-input mt-1" type="date" value={form.rent_free_until} onChange={e=>set('rent_free_until',e.target.value)}/></label>
    <label className="text-sm">Supplier return due
     <input className="form-input mt-1" type="date" value={form.return_due_on} onChange={e=>set('return_due_on',e.target.value)}/></label>
    <label className="text-sm">Rental / forced-sale terms review
     <input className="form-input mt-1" type="date" value={form.rental_review_on} onChange={e=>set('rental_review_on',e.target.value)}/></label>
    <label className="text-sm">Supplier contract / hire terms reference
     <input className="form-input mt-1" value={form.rental_terms_reference} onChange={e=>set('rental_terms_reference',e.target.value)} maxLength={250} placeholder="Quote, terms document or supplier reference"/></label>
    <label className="text-sm">Cylinder test due (supplier evidence)
     <input className="form-input mt-1" type="date" value={form.cylinder_test_due_on} onChange={e=>set('cylinder_test_due_on',e.target.value)}/></label>
    <label className="text-sm">Last documented leak check
     <input className="form-input mt-1" type="date" value={form.last_leak_check_on} onChange={e=>set('last_leak_check_on',e.target.value)}/></label>
    <label className="text-sm md:col-span-2">Custody notes / return receipt
     <textarea className="form-input mt-1" rows={2} maxLength={2000} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Inspection reference, return docket or discrepancy details"/></label>
    <label className="text-sm md:col-span-2">New audit / supplier docket reference *
     <input className="form-input mt-1" maxLength={120} value={form.audit_reference} onChange={e=>set('audit_reference',e.target.value)} placeholder="Required for every registration and custody change"/></label>
   </div>
   {error&&<p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
   {success&&<p className="text-sm text-green-700 mt-3" role="status">{success}</p>}
   {canSave&&!completed&&!pending&&!error&&<div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 mt-3">
    <p className="text-sm font-semibold text-amber-900">Ready to confirm — review physical cylinder custody</p>
    <p className="text-xs text-amber-900 mt-1">{form.cylinder_serial} · {form.gas_label} · {pretty(form.status)} · {pretty(form.location_kind)} · {form.audit_reference}</p>
    <p className="text-xs mt-1">This changes cylinder custody records only. It does not change refrigerant kg, warehouse stock, van stock or supplier billing.</p>
   </div>}
   <div className="flex gap-3 items-center mt-4">
    <button type="button" className="btn btn-primary" disabled={!canSave||pending||completed} onClick={submit}>
     {completed?'Custody recorded':pending?'Recording…':form.id?'Confirm custody update':'Register cylinder'}
    </button>
    {completed&&<button type="button" className="text-sm text-blue-700 underline" onClick={fresh}>Record another cylinder</button>}
   </div>
  </section>}
 </div>
}
