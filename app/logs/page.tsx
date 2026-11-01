// Company-wide history for managers; technicians see only their assigned van.
// Includes supplier receipts as well as operational activity.
import {getTransactionHistory} from '@/lib/actions'

const typeLabels:Record<string,string>={
 'issue':'Issue / consumables',
 'return':'Return',
 'van-to-van':'Van transfer',
 'van-to-warehouse':'Van → warehouse',
 'warehouse-to-van':'Warehouse → van',
 'depot':'Depot return',
 'adjust':'Stock adjustment',
 'opening-stock':'Opening stock',
 'receipt-pack':'Supplier pack receipt',
 'receipt-loose':'Loose item receipt',
}
const types=[{value:'all',label:'All transactions'},...Object.entries(typeLabels).map(([value,label])=>({value,label}))]
function processorLabel(name:string|null){return name?name+' ('+name.trim().split(/\s+/).map(part=>part.charAt(0).toUpperCase()).join('')+')':'Unknown user'}
function safeString(value:unknown){return typeof value==='string'?value:''}

export default async function LogsPage({searchParams}:{
 searchParams:{from?:string;to?:string;type?:string}
}){
 const start=safeString(searchParams?.from)
 const end=safeString(searchParams?.to)
 const requestedType=safeString(searchParams?.type)||'all'
 const selected=types.some(t=>t.value===requestedType)?requestedType:'all'
 let history:Awaited<ReturnType<typeof getTransactionHistory>>|null=null
 let error=''
 try{history=await getTransactionHistory(start,end,selected)}
 catch(e){error=e instanceof Error?e.message:'Could not load transaction history'}
 const entries=history?.entries??[]
 return <div>
  <div className="topbar"><h1 className="topbar-title">Transaction History</h1></div>
  <div className="p-5 space-y-4">
   <section className="card">
    <h2 className="font-semibold text-sm mb-1">Find past stock transactions</h2>
    <p className="text-xs text-gray-500 mb-4">Includes recorded stock activity, supplier pack receipts and loose-item receipts. Dates include the entire calendar day in Perth (AWST).</p>
    <form method="get" action="/logs" className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
     <div><label htmlFor="history-from" className="form-label">From date</label>
      <input type="date" id="history-from" name="from" defaultValue={start} className="form-input"/></div>
     <div><label htmlFor="history-to" className="form-label">To date</label>
      <input type="date" id="history-to" name="to" defaultValue={end} className="form-input"/></div>
     <div><label htmlFor="history-type" className="form-label">Transaction type</label>
      <select id="history-type" name="type" defaultValue={selected} className="form-input">{types.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
     <div className="flex items-center flex-wrap gap-2">
      <button type="submit" className="btn btn-primary">Apply filters</button>
      <a href="/logs" className="btn">Clear</a>
     </div>
    </form>
   </section>
   <section className="card">
    <div className="flex justify-between items-center gap-2 mb-3">
     <h2 className="font-semibold text-sm">Transaction records</h2>
     <span className="text-xs text-gray-500">{entries.length} shown</span>
    </div>
    {error&&<p className="text-sm text-red-700 mb-3" role="alert">{error}</p>}
    {history?.capped&&<p className="text-sm text-amber-700 mb-3" role="status">Showing the latest 500 matching transactions only. Narrow the date range to review earlier records.</p>}
    {!error&&entries.length===0?<p className="text-sm text-gray-500 py-4">No recorded transactions match these filters.</p>:null}
    {entries.length>0&&<div className="overflow-x-auto">
     <table className="w-full">
      <thead><tr>
       {['Date / time (Perth)','Transaction','Product','Qty','Location','Reference','Processed by','Details'].map(t=><th key={t} className="table-header">{t}</th>)}
      </tr></thead>
      <tbody>{entries.map(r=><tr key={r.id} className="hover:bg-gray-50">
       <td className="table-cell whitespace-nowrap text-xs">{new Date(r.date).toLocaleString('en-AU',{timeZone:'Australia/Perth',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
       <td className="table-cell whitespace-nowrap">{typeLabels[r.type]??r.type}</td>
       <td className="table-cell font-medium">{r.product}</td>
       <td className="table-cell whitespace-nowrap">{r.quantity.toLocaleString('en-AU')}{r.unit?' '+r.unit:''}</td>
       <td className="table-cell">{r.location}</td>
       <td className="table-cell">{r.reference||'—'}</td>
       <td className="table-cell whitespace-nowrap">{r.processorInitials??(r.processedBy?processorLabel(r.processedBy).split('(').pop()?.replace(')',''):'—')}</td>
       <td className="table-cell text-xs text-gray-500">{r.notes||'—'}</td>
      </tr>)}</tbody>
     </table>
    </div>}
    <p className="text-xs text-gray-500 mt-3">The history covers records captured by VanStock. Administrative configuration changes and external ServiceM8 transactions are not included. Access follows your assigned role and van.</p>
   </section>
  </div>
 </div>
}
