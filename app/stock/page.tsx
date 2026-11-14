import { redirect } from 'next/navigation'
import Link from 'next/link'
// ============================================================
// app/stock/page.tsx
// Shows every item on the current user's van with quantities,
// stock level bars, and an adjust button on each row.
// ============================================================

import { getMyStock, getProducts, getWorkingVans, getWorkingVanStandards, getCurrentUserDisplay, getMyWarehouseRights, getWarehouseRequestLocations, getWarehouseRequests, getWarehouseRequestBalances, getWarehouseRequestPackages } from '@/lib/actions'
import { buildStockDisplayRows } from '@/lib/stock-standards'
import WorkingVanSelector from '@/components/WorkingVanSelector'
import WarehouseRequestForm from '@/components/WarehouseRequestForm'
import WarehouseRequestQueue from '@/components/WarehouseRequestQueue'
import {warehouseWritesEnabled} from '@/lib/warehouse-release'

export default async function StockPage({searchParams}:{searchParams:{van?:string;request?:string}}) {
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
  const [requestWarehouses,requests,warehouseBalances,requestPackages]=await Promise.all([getWarehouseRequestLocations(),getWarehouseRequests(searchParams?.request),getWarehouseRequestBalances(),getWarehouseRequestPackages()])
  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">My Van Stock</h1>
      </div>

      <div className="p-5">
        <WorkingVanSelector vans={working.vans} selectedId={working.selectedId} defaultId={working.defaultId} />
        {(warehouseRights.canRequest||requests.length>0)&&<WarehouseRequestQueue requests={requests} focusRequestId={searchParams?.request} warehouses={requestWarehouses} vans={working.vans} products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))} canManage={false} writesEnabled={warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED)} receiverVanIds={user.role==='manager' && !warehouseRights.canReceiveRequests ? [] : working.vans.map(v=>v.id)} balances={warehouseBalances}/>}
        <div className="card">
          <h2 className="text-sm font-semibold mb-3">Current van stock</h2>
          <div className="md:hidden space-y-2">
            {displayRows.map(s=><div key={s.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex justify-between gap-3"><span className="text-sm font-semibold">{s.product?.name}</span><span className={`badge flex-shrink-0 ${s.status==='Critical'?'badge-critical':s.status==='Low'?'badge-low':'badge-ok'}`}>{s.status}</span></div>
              <p className="text-lg font-semibold mt-2">{s.quantity} {s.product?.stock_unit??'ea'}</p>
              <p className="text-xs text-gray-500">Minimum: {s.minimum} · Target: {s.target??'Not set'} · {s.product?.category}</p>
            </div>)}
            {!displayRows.length&&<p className="text-sm text-gray-500">No stock recorded for this van.</p>}
          </div>
          <table className="hidden md:table w-full">
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
        {warehouseRights.canRequest&&working.selectedId&&<WarehouseRequestForm warehouses={requestWarehouses} products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))} vans={working.vans} selectedVanId={working.selectedId} balances={warehouseBalances} packages={requestPackages}/>}
        {warehouseRights.canReceive && <section className="card mt-4">
          <h2 className="text-sm font-semibold">Return unused stock to warehouse</h2>
          <p className="text-xs text-gray-500 mt-1 mb-2">Van balances above are view-only. Returns are recorded using the separate controlled return workflow, for your selected authorised Working Van.</p>
          <Link href="/warehouse/returns" className="text-sm font-semibold text-blue-700 underline">Open Van → Warehouse returns</Link>
        </section>}
      </div>
    </div>
  )
}
