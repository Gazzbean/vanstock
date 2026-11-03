import {redirect} from 'next/navigation'
import {getCurrentUserDisplay,getFleetVanStock,getProducts} from '@/lib/actions'
import {buildStockDisplayRows} from '@/lib/stock-standards'

export default async function FleetPage({searchParams}:{searchParams:{van?:string}}){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(user.role!=='admin'&&!user.access?.office_access)
  return <div className="p-5"><h1 className="text-lg font-semibold">Fleet Stock</h1><p className="text-sm text-red-700 mt-2">Office access required.</p></div>
 const [fleet,products]=await Promise.all([getFleetVanStock(searchParams?.van),getProducts()])
 const rows=buildStockDisplayRows(products,fleet.items.map((item:any)=>({
   id:item.id,product_id:item.product_id,quantity:Number(item.quantity),product:item.product,
 })),fleet.standards as any)
 const selected=fleet.vans.find(v=>v.id===fleet.selectedId)
 return <div><div className="topbar"><h1 className="topbar-title">Fleet Stock</h1></div>
  <div className="p-5 space-y-4">
   <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
    <h2 className="font-semibold text-sm">View any company van</h2>
    <p className="text-xs text-gray-600 mt-1 mb-3">Read-only stock inspection. Selecting another vehicle does not change your working van, permissions or stock.</p>
    <form action="/fleet" method="get" className="flex flex-wrap items-end gap-3">
     <label className="form-label">Vehicle<select className="form-input mt-1" name="van" defaultValue={fleet.selectedId??''}>
      {fleet.vans.map(v=><option key={v.id} value={v.id}>{v.van_number}{v.registration?` (${v.registration})`:''}</option>)}
     </select></label><button className="btn btn-primary" type="submit">View stock</button>
    </form>
    <p className="text-xs text-gray-600 mt-3">Assigned user(s): {fleet.assignedUsers.length?fleet.assignedUsers.map(u=>u.full_name+(u.initials?` (${u.initials})`:'' )).join(', '):'Unallocated'}</p>
   </section>
   <section className="card"><h2 className="font-semibold text-sm mb-3">{selected?.van_number??'No active vans'} — stock inventory</h2>
    <div className="overflow-x-auto"><table className="w-full"><thead><tr>{['Product','Category','Quantity','Van minimum','Target','Status'].map(h=><th key={h} className="table-header">{h}</th>)}</tr></thead>
     <tbody>{rows.map(row=><tr key={row.product_id}><td className="table-cell font-medium">{row.product?.name??'Unknown product'}</td><td className="table-cell">{row.product?.category??'—'}</td>
      <td className="table-cell">{row.quantity} {row.product?.stock_unit??'ea'}</td><td className="table-cell">{row.minimum} {row.product?.stock_unit??'ea'}</td>
      <td className="table-cell">{row.target===null?'—':`${row.target} ${row.product?.stock_unit??'ea'}`}</td><td className="table-cell">{row.status}</td></tr>)}
      {rows.length===0&&<tr><td className="table-cell text-gray-500 py-4 text-center" colSpan={6}>No recorded stock for this van. This is not a confirmed physical count.</td></tr>}</tbody></table></div>
   </section>
  </div>
 </div>
}
