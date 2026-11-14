import Link from 'next/link'
import {redirect} from 'next/navigation'
import TechnicianWarehouseMovement from '@/components/TechnicianWarehouseMovement'
import {getCurrentUserDisplay,getMyWarehouseRights,getWarehouseOperationLocations,getWarehouseReturnSourceVans,getProducts} from '@/lib/actions'
import {warehouseWritesEnabled} from '@/lib/warehouse-release'

export default async function WarehouseReturnsPage(){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 const rights=await getMyWarehouseRights()
 if(!rights.canReceive) return <div className="p-5">
   <h1 className="text-lg font-semibold">Return stock from van</h1>
   <p className="text-sm text-gray-600 mt-2">Warehouse return permission required.</p>
   <Link href={user.access?.technician_access?'/stock':'/warehouse'} className="text-blue-700 underline mt-4 inline-block">Back to stock</Link>
 </div>
 const [warehouses,vans,products]=await Promise.all([
  getWarehouseOperationLocations(),getWarehouseReturnSourceVans(),getProducts(),
 ])
 return <div>
  <div className="topbar"><h1 className="topbar-title">Van → Warehouse return</h1></div>
  <div className="p-5">
   <p className="text-sm text-gray-600 mb-3">Return actual goods into warehouse stock. For replenishment requests and van receipt confirmations, use the existing request queue.</p>
   <Link href={user.access?.technician_access?'/stock':'/warehouse'} className="text-sm text-blue-700 underline">Back to stock</Link>
   {user.role==='technician'&&<p className="text-xs text-gray-500 mt-2">Only the selected, authorised Working Van can be used. Change Working Van in My Van Stock if required.</p>}
   <TechnicianWarehouseMovement warehouses={warehouses} products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))}
      vans={vans} enabled={warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED)}/>
  </div>
 </div>
}
