'use client'

import {useMemo,useState} from 'react'

type Product={id:string;name:string;stock_unit:string|null;archived_at:string|null}
type Van={id:string;van_number:string}
type Standard={id:string;van_id:string;product_id:string;classification:string;min_quantity:number;target_quantity:number}
type Balance={van_id:string;product_id:string;quantity:number}

type OverviewRow={key:string;vanId:string;vanName:string;productName:string;unit:string;classification:string;min:number;target:number;current:number;shortfall:number;status:'below_min'|'below_target'|'on_target'|'optional'|'not_assigned'|'unconfigured'}

function format(n:number){return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}

export default function FleetStandardsOverview({products,vans,standards,balances}:{
 products:Product[];vans:Van[];standards:Standard[];balances:Balance[]
}){
 const [vanFilter,setVanFilter]=useState('all')
 const [statusFilter,setStatusFilter]=useState('all')
 const [query,setQuery]=useState('')
 const [showUnconfigured,setShowUnconfigured]=useState(false)
 const rows=useMemo(()=>{
  const standardMap=new Map(standards.map(s=>[s.van_id+'|'+s.product_id,s]))
  const balanceMap=new Map(balances.map(b=>[b.van_id+'|'+b.product_id,Number(b.quantity)]))
  const result:OverviewRow[]=[]
  for(const van of vans){
   for(const product of products){
    if(product.archived_at)continue
    const key=van.id+'|'+product.id
    const s=standardMap.get(key)
    if(!s&&!showUnconfigured)continue
    const current=balanceMap.get(key)??0
    const min=Number(s?.min_quantity??0)
    const target=Number(s?.target_quantity??0)
    const cls=s?.classification??'unconfigured'
    const status:OverviewRow['status']=!s?'unconfigured':cls==='optional'?'optional':cls==='not_assigned'?'not_assigned':current<min?'below_min':current<target?'below_target':'on_target'
    result.push({
      key,vanId:van.id,vanName:van.van_number,productName:product.name,
      unit:product.stock_unit||'ea',classification:cls,min,target,current,
      shortfall:cls==='mandatory'||cls==='preferred'?Math.max(0,target-current):0,status
    })
   }
  }
  return result
 },[products,vans,standards,balances,showUnconfigured])
 const visible=rows.filter(r=>(vanFilter==='all'||r.vanId===vanFilter)
  &&(statusFilter==='all'||r.status===statusFilter)
  &&r.productName.toLowerCase().includes(query.trim().toLowerCase()))
 const configured=rows.filter(r=>r.status!=='unconfigured')
 const count=(state:OverviewRow['status'])=>configured.filter(r=>r.status===state).length
 const unconfiguredTotal=vans.length*products.filter(p=>!p.archived_at).length-standards.filter(s=>products.some(p=>p.id===s.product_id&&!p.archived_at)&&vans.some(v=>v.id===s.van_id)).length
 return <section className="card mt-4">
  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
   <div>
    <h2 className="text-sm font-medium">Fleet stock standards overview</h2>
    <p className="text-xs text-gray-500 mt-1">Read-only comparison of configured van standards and actual sample stock. No purchases or transfers are created.</p>
   </div>
   <span className="text-xs text-gray-500">{configured.length} configured assignments · {unconfiguredTotal} not configured</span>
  </div>
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
   <div className="metric-card"><div className="metric-label">Below minimum</div><div className="metric-value text-red-700">{count('below_min')}</div></div>
   <div className="metric-card"><div className="metric-label">Below target</div><div className="metric-value text-amber-700">{count('below_target')}</div></div>
   <div className="metric-card"><div className="metric-label">At or above target</div><div className="metric-value">{count('on_target')}</div></div>
   <div className="metric-card"><div className="metric-label">Optional / Not assigned</div><div className="metric-value">{count('optional')+count('not_assigned')}</div></div>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
   <div><label className="form-label" htmlFor="fleet-van-filter">Van</label>
    <select className="form-input" id="fleet-van-filter" value={vanFilter} onChange={e=>setVanFilter(e.target.value)}>
     <option value="all">All vans</option>{vans.map(v=><option key={v.id} value={v.id}>{v.van_number}</option>)}
    </select>
   </div>
   <div><label className="form-label" htmlFor="fleet-status-filter">Stock status</label>
    <select className="form-input" id="fleet-status-filter" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
     <option value="all">All statuses</option>
     <option value="below_min">Below minimum</option><option value="below_target">Below target</option>
     <option value="on_target">At or above target</option><option value="optional">Optional</option>
     <option value="not_assigned">Not assigned</option><option value="unconfigured">Not configured</option>
    </select>
   </div>
   <div><label className="form-label" htmlFor="fleet-search">Find product</label>
    <input className="form-input" id="fleet-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search part description"/>
   </div>
  </div>
  <label className="text-xs text-gray-700 flex items-center gap-2 mb-3">
   <input type="checkbox" checked={showUnconfigured} onChange={e=>setShowUnconfigured(e.target.checked)}/>
   Include products with no van standard (not automatically considered shortages)
  </label>
  <div className="overflow-x-auto">
   <table className="w-full">
    <thead><tr>
     {['Van','Product','Class','Current','Minimum','Target','To target','Status'].map(h=><th key={h} className="table-header">{h}</th>)}
    </tr></thead>
    <tbody>
     {visible.map(r=><tr key={r.key} className="hover:bg-gray-50">
      <td className="table-cell whitespace-nowrap">{r.vanName}</td>
      <td className="table-cell font-medium">{r.productName}</td>
      <td className="table-cell capitalize">{r.classification.replace('_',' ')}</td>
      <td className="table-cell whitespace-nowrap">{format(r.current)} {r.unit}</td>
      <td className="table-cell">{r.status==='unconfigured'?'—':format(r.min)}</td>
      <td className="table-cell">{r.status==='unconfigured'?'—':format(r.target)}</td>
      <td className="table-cell">{r.status==='unconfigured'||r.status==='optional'||r.status==='not_assigned'?'—':format(r.shortfall)}</td>
      <td className="table-cell whitespace-nowrap">
       <span className={r.status==='below_min'?'text-red-700':r.status==='below_target'?'text-amber-700':'text-gray-600'}>
        {{below_min:'Below minimum',below_target:'Below target',on_target:'At target',optional:'Optional',not_assigned:'Not assigned',unconfigured:'Not configured'}[r.status]}
       </span>
      </td>
     </tr>)}
     {!visible.length&&<tr><td colSpan={8} className="table-cell text-center text-gray-500 py-5">No matching stock standards. Save van standards above, or include unconfigured products.</td></tr>}
    </tbody>
   </table>
  </div>
  <p className="text-xs text-gray-500 mt-3">Quantities reflect the current database snapshot. “To target” is a planning difference, not a purchase recommendation; cylinder package sizes are handled separately. Missing physical stock rows are treated as zero.</p>
 </section>
}
