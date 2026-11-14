import Link from 'next/link'
import {redirect} from 'next/navigation'
import {getCurrentUserDisplay,getMyWarehouseRights,getWarehouseRequests,getVanTransferWorkspace} from '@/lib/actions'
import RefreshButton from '@/components/RefreshButton'

const warehouseStatus:Record<string,string>={pending:'Awaiting approval',approved:'Ready for warehouse issue',issued:'Awaiting van receipt'}

export default async function MyActions(){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(!user.access?.office_access&&!user.access?.technician_access)redirect('/dashboard')
 const [rights,requests,transfers]=await Promise.all([
  getMyWarehouseRights(),getWarehouseRequests(),getVanTransferWorkspace(),
 ])
 const warehouse=requests.filter(r=>(r.status==='pending'&&rights.canApproveRequests)||(r.status==='approved'&&rights.canIssueRequests)||(r.status==='issued'&&(rights.canReceiveRequests||transfers.receiverVanIds.includes(r.van_id))))
 const vanTransfers=transfers.requests.filter(r=>r.status==='pending'&&(transfers.managed||transfers.receiverVanIds.includes(r.destination_van_id)))
 const count=warehouse.length+vanTransfers.length
 return <div>
  <div className="topbar"><h1 className="topbar-title">My Actions</h1><RefreshButton /></div>
  <div className="p-4 sm:p-5 max-w-5xl space-y-4">
   <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
    <h2 className="text-lg font-semibold">{count===0?'You’re up to date':`${count} action${count===1?'':'s'} need your attention`}</h2>
    <p className="text-sm text-gray-600 mt-1">Select an action to go straight to the relevant request. Completed items remain in Transaction History.</p>
   </div>
   {warehouse.map(r=><Link key={r.id} href={`${rights.canManageRequests||rights.canReceiveRequests?'/warehouse':'/stock'}?request=${encodeURIComponent(r.id)}#warehouse-request-${r.id}`} className="block rounded-xl border-2 border-amber-200 bg-white p-4 hover:border-blue-400 focus:outline-blue-600">
    <div className="flex items-center justify-between flex-wrap gap-2"><strong className="text-sm">📦 Warehouse replenishment</strong><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">{warehouseStatus[r.status]}</span></div>
    <p className="text-sm mt-2">{r.reference} · {r.quantity} stock units</p>
    <p className="text-blue-700 font-semibold text-sm mt-3">Review request →</p>
   </Link>)}
   {vanTransfers.map(r=><Link key={r.id} href={`/van-transfers#van-transfer-${r.id}`} className="block rounded-xl border-2 border-amber-200 bg-white p-4 hover:border-blue-400 focus:outline-blue-600">
    <div className="flex items-center justify-between flex-wrap gap-2"><strong className="text-sm">🚚 Van-to-van transfer</strong><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Awaiting decision</span></div>
    <p className="text-sm mt-2">{r.reason} · {r.quantity} stock units</p>
    <p className="text-blue-700 font-semibold text-sm mt-3">Review transfer →</p>
   </Link>)}
   {count===0&&<div className="card"><p className="text-sm text-gray-600">No stock approvals or receiving confirmations are currently waiting for you.</p><Link href="/dashboard" className="text-blue-700 underline inline-block mt-2">Back to Dashboard</Link></div>}
  </div>
 </div>
}
