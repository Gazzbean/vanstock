import { redirect } from 'next/navigation'
// ============================================================
// app/stock/page.tsx
// Shows every item on the current user's van with quantities,
// stock level bars, and an adjust button on each row.
// ============================================================

import { getMyStock, getProducts, getWorkingVans, getWorkingVanStandards, getCurrentUserDisplay, getMyWarehouseRights, getWarehouseRequestLocations, getWarehouseRequests, getWarehouseOperationLocations } from '@/lib/actions'
import { buildStockDisplayRows } from '@/lib/stock-standards'
import WorkingVanSelector from '@/components/WorkingVanSelector'
import WarehouseRequestForm from '@/components/WarehouseRequestForm'
import WarehouseRequestQueue from '@/components/WarehouseRequestQueue'
import TechnicianWarehouseMovement from '@/components/TechnicianWarehouseMovement'

export default async function StockPage({searchParams}:{searchParams:{van?:string}}) {
  const user=await getCurrentUserDisplay()
  if(!user)redirect('/login')
  if(!user.access?.technician_access)redirect('/dashboard')
  const working=await getWorkingVans(searchParams?.van)
  const [stockItems, products, standards] = await Promise.all([
    getMyStock(working.selectedId??undefined), getProducts(),
    getWorkingVanStandards(working.selectedId??undefined),
  ])
  const displayRows = buildStockDisplayRows(products, stockItems, standards)
  const warehouseRights=await getMyWarehouseRights()
  const [requestWarehouses,requests]=warehouseRights.canRequest
    ? await Promise.all([getWarehouseRequestLocations(),getWarehouseRequests()])
    : [[],[]]
  const movementWarehouses=(warehouseRights.canIssue||warehouseRights.canReceive)
    ? await getWarehouseOperationLocations():[]

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">My Van Stock</h1>
      </div>

      <div className="p-5">
        <WorkingVanSelector vans={working.vans} selectedId={working.selectedId} defaultId={working.defaultId} />
        <div className="card">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Item</th>
                <th className="table-header">Category</th>
                <th className="table-header">Qty</th>
                <th className="table-header">Min</th>
                <th className="table-header">Target</th>
                <th className="table-header">Status</th>
                <th className="table-header w-28">Level</th>
                <th className="table-header w-16"></th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((s) => {
                const st = s.status
                const pctPx = Math.round(s.fill * 100)
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{s.product?.name}</td>
                    <td className="table-cell">
                      <span className="badge badge-gray">{s.product?.category}</span>
                    </td>
                    <td className="table-cell font-medium">{s.quantity} {s.product?.stock_unit ?? 'ea'}</td>
                    <td className="table-cell text-gray-400">{s.minimum} {s.product?.stock_unit ?? 'ea'}</td>
                    <td className="table-cell text-gray-400">{s.target === null ? '—' : `${s.target} ${s.product?.stock_unit ?? 'ea'}`}</td>
                    <td className="table-cell">
                      <span className={`badge ${st === 'Critical' ? 'badge-critical' : st === 'Low' ? 'badge-low' : 'badge-ok'}`}>{st}</span>
                    </td>
                    <td className="table-cell">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden w-24">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pctPx}%`, background: st === 'Critical' ? '#ef4444' : st === 'Low' ? '#f59e0b' : '#22c55e' }}
                        />
                      </div>
                    </td>
                    <td className="table-cell text-xs text-gray-500">View only</td>
                  </tr>
                )
              })}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-cell text-center text-gray-400 py-6">
                    No stock items found. Ask your manager to add products.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {warehouseRights.canRequest&&working.selectedId&&<>
          <WarehouseRequestForm warehouses={requestWarehouses} products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))} vans={working.vans} selectedVanId={working.selectedId}/>
          <WarehouseRequestQueue requests={requests} warehouses={requestWarehouses} vans={working.vans} products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))} canManage={false} writesEnabled={false}/>
        </>}
        {(warehouseRights.canIssue||warehouseRights.canReceive)&&<TechnicianWarehouseMovement
          warehouses={movementWarehouses}
          products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))}
          defaultVanId={working.defaultId}
          canIssue={warehouseRights.canIssue} canReceive={warehouseRights.canReceive}
        />}
      </div>
    </div>
  )
}
