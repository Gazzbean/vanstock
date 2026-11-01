import {redirect} from 'next/navigation'
import Link from 'next/link'
import {getCurrentUserDisplay,getAdminProducts,getPhase1BSupplierData} from '@/lib/actions'
import ReceiveStockWorkflow from '@/components/ReceiveStockWorkflow'

export default async function ReceiveStockPage(){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(user.role!=='manager'&&user.role!=='admin'){
  return <div><div className="topbar"><h1 className="topbar-title">Receive Stock</h1></div>
   <div className="p-5"><div className="card">
    <h2 className="font-medium">Manager access required</h2>
    <p className="text-sm text-gray-500 mt-2">The receiving screen is currently available to managers and administrators while the workflow is being tested.</p>
   </div></div></div>
 }
 const [products,config]=await Promise.all([getAdminProducts(),getPhase1BSupplierData()])
 return <div>
  <div className="topbar"><h1 className="topbar-title">Receive Stock</h1></div>
  <div className="p-5 space-y-4">
   <div className="flex flex-wrap gap-3 items-center justify-between">
    <p className="text-sm text-gray-600">Record incoming stock in three steps. Pack setup remains in Administration.</p>
    <Link href="/admin" className="text-sm text-blue-700 underline">Supplier and package settings</Link>
   </div>
   <ReceiveStockWorkflow
    products={products.map(p=>({id:p.id,name:p.name,stock_unit:p.stock_unit,archived_at:p.archived_at}))}
    suppliers={config.suppliers}
    packages={config.options}
    vans={config.vans}
    warehouses={config.warehouses}
   />
  </div>
 </div>
}
