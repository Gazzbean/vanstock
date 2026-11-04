import {redirect} from 'next/navigation'
import {getCurrentUserDisplay,getFleetVanStock,getFleetStockComparison,getProducts} from '@/lib/actions'
import {buildStockDisplayRows} from '@/lib/stock-standards'
import {buildFleetComparisonRows} from '@/lib/fleet-comparison'

export default async function FleetPage({searchParams}:{searchParams:{van?:string}}){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(user.role!=='admin'&&!user.access?.office_access)
  return <div className="p-5"><h1 className="text-lg font-semibold">Fleet Stock</h1><p className="text-sm text-red-700 mt-2">Office access required.</p></div>
 const showAll=searchParams?.van==='all'
 const [fleet,comparison,products]=await Promise.all([
  showAll?Promise.resolve(null):getFleetVanStock(searchParams?.van),
  showAll?getFleetStockComparison():Promise.resolve(null),getProducts(),
 ])
 const rows=buildStockDisplayRows(products,(fleet?.items??[]).map((item:any)=>({
   id:item.id,product_id:item.product_id,quantity:Number(item.quantity),product:item.product,
 })),(fleet?.standards??[]) as any)
 const vans=fleet?.vans??comparison?.vans??[]
 const selected=fleet?.vans.find(v=>v.id===fleet.selectedId)
 const totals=comparison?buildFleetComparisonRows(comparison.products,comparison.vans,comparison.balances):[]
 return <div><div className="topbar"><h1 className="topbar-title">Fleet Stock</h1></div>
  <div className="p-5 space-y-4">
   <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
    <h2 className="font-semibold text-sm">View and compare company vans</h2>
    <p className="text-xs text-gray-600 mt-1 mb-3">Read-only stock inspection. Select one van or compare all active vans. This does not change your working van, permissions or stock.</p>
    <form action="/fleet" method="get" className="flex flex-wrap items-end gap-3">
     <label className="form-label">Vehicle<select className="form-input mt-1" name="van" defaultValue={showAll?'all':fleet?.selectedId??''}>
      <option value="all">All vans — total stock comparison</option>
      {vans.map(v=><option key={v.id} value={v.id}>{v.van_number}{'registration' in v&&v.registration?` (${v.registration})`:''}</option>)}
     </select></label><button className="btn btn-primary" type="submit">View stock</button>
    </form>
    {!showAll&&fleet&&<p className="text-xs text-gray-600 mt-3">Assigned user(s): {fleet.assignedUsers.length?fleet.assignedUsers.map(u=>u.full_name+(u.initials?` (${u.initials})`:'' )).join(', '):'Unallocated'}</p>}
   </section>
   {showAll&&comparison?<section className="card">
    <h2 className="font-semibold text-sm mb-3">All vans — stock comparison</h2>
    <p className="text-xs text-gray-500 mb-3">Each total is the sum of recorded quantities for that product across active vans. A dash means no balance recorded for that van; this is not a physical stocktake.</p>
    <div className="overflow-x-auto"><table className="w-full"><thead><tr>
     <th className="table-header">Product</th><th className="table-header">Category</th>
     {comparison.vans.map(v=><th className="table-header" key={v.id}>{v.van_number}</th>)}
     <th className="table-header">Total — all vans</th>
    </tr></thead><tbody>{totals.map(row=><tr key={row.product.id}>
     <td className="table-cell font-medium">{row.product.name}</td><td className="table-cell"><span className="badge badge-gray">{row.product.category}</span></td>
     {comparison.vans.map(v=><td className="table-cell" key={v.id}>{row.byVan[v.id]===undefined?'—':`${row.byVan[v.id]} ${row.product.stock_unit??'ea'}`}</td>)}
     <td className="table-cell font-semibold">{row.total} {row.product.stock_unit??'ea'}</td>
    </tr>)}
    {!totals.length&&<tr><td className="table-cell text-gray-500 text-center" colSpan={comparison.vans.length+3}>No recorded stock in active vans.</td></tr>}
    </tbody></table></div>
   </section>:<section className="card"><h2 className="font-semibold text-sm mb-3">{selected?.van_number??'No active vans'} — stock inventory</h2>
    <div className="overflow-x-auto"><table className="w-full"><thead><tr>{['Product','Category','Quantity','Van minimum','Target','Status','Level'].map(h=><th key={h} className="table-header">{h}</th>)}</tr></thead>
     <tbody>{rows.map(row=><tr key={row.product_id}><td className="table-cell font-medium">{row.product?.name??'Unknown product'}</td><td className="table-cell"><span className="badge badge-gray">{row.product?.category??'—'}</span></td>
      <td className="table-cell">{row.quantity} {row.product?.stock_unit??'ea'}</td><td className="table-cell">{row.minimum} {row.product?.stock_unit??'ea'}</td>
      <td className="table-cell">{row.target===null?'—':`${row.target} ${row.product?.stock_unit??'ea'}`}</td><td className="table-cell"><span className={`badge ${row.status==='Critical'?'badge-critical':row.status==='Low'?'badge-low':'badge-ok'}`}>{row.status}</span></td>
      <td className="table-cell"><div className="h-1.5 rounded-full bg-gray-100 overflow-hidden w-24"><div className="h-full rounded-full" style={{width:`${Math.round(row.fill*100)}%`,background:row.status==='Critical'?'#ef4444':row.status==='Low'?'#f59e0b':'#22c55e'}} /></div></td></tr>)}
      {rows.length===0&&<tr><td className="table-cell text-gray-500 py-4 text-center" colSpan={7}>No recorded stock for this van. This is not a confirmed physical count.</td></tr>}</tbody></table></div>
   </section>}
  </div>
 </div>
}
