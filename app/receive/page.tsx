import {redirect} from 'next/navigation'
import Link from 'next/link'
import {getCurrentUserDisplay,getReceivingSetup,getRecentStockReceipts} from '@/lib/actions'
import ReceiveStockWorkflow from '@/components/ReceiveStockWorkflow'

export default async function ReceiveStockPage(){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(!user.access?.receive_stock){
  return <div><div className="topbar"><h1 className="topbar-title">Receive Stock</h1></div>
   <div className="p-5"><div className="card">
    <h2 className="font-medium">Receiving access required</h2>
    <p className="text-sm text-gray-500 mt-2">You do not have receiving permission. Contact an administrator.</p>
   </div></div></div>
 }
 const [config,initialReceipts]=await Promise.all([getReceivingSetup(),getRecentStockReceipts()])
 return <div>
  <div className="topbar"><h1 className="topbar-title">Receive Stock</h1></div>
  <div className="p-5 space-y-4">
   <div className="flex flex-wrap gap-3 items-center justify-between">
    <p className="text-sm text-gray-600">Record incoming stock in three steps. Pack setup remains in Administration.</p>
    {user.role === 'admin' || user.role === 'manager' ? <Link href="/admin" className="text-sm text-blue-700 underline">Supplier and package settings</Link> : null}
   </div>
   <ReceiveStockWorkflow
    initialReceipts={initialReceipts}
    products={config.products.map(p=>({id:p.id,name:p.name,stock_unit:p.stock_unit,archived_at:p.archived_at}))}
    suppliers={config.suppliers}
    packages={config.options}
    vans={config.vans}
    warehouses={config.warehouses}
   />
  </div>
 </div>
}
