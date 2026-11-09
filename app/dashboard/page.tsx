// ============================================================
// app/dashboard/page.tsx   (FIX — replaces existing file)
//
// WHAT CHANGED:
// 1. The van number now appears prominently in the TOP BAR
//    (next to the page title), not just as a small badge buried
//    inside the "Stock overview" card.
// 2. Also kept it on the Stock overview card for consistency,
//    but made it larger/clearer there too.
// ============================================================

import { getDashboardStats, getMyStock, getActivityLog, getCurrentUserDisplay, getProducts, getWorkingVanStandards, getWorkingVans, getWarehouseRequests, getMyWarehouseRights } from '@/lib/actions'
import { buildStockDisplayRows } from '@/lib/stock-standards'
import WorkingVanSelector from '@/components/WorkingVanSelector'
import WarehousePendingActions from '@/components/WarehousePendingActions'
import WelcomeGuide from '@/components/WelcomeGuide'
import Link from 'next/link'

const typeLabels: Record<string, string> = {
  issue:       'Issued to customer',
  return:      'Return from customer',
  'van-to-van':'Van transfer',
  depot:       'Returned to depot',
  adjust:      'Stock adjustment',
}

export default async function DashboardPage({searchParams}:{searchParams:{van?:string}}) {
  const user = await getCurrentUserDisplay()
  // An office-only user has no working van: present an office dashboard
  // rather than zero van balances and an unusable Adjust Stock action.
  if(user?.access?.office_access && !user.access.technician_access){
    const [recentLogs,requests,rights]=await Promise.all([getActivityLog(),getWarehouseRequests(),getMyWarehouseRights()])
    return <div>
      <div className="topbar"><h1 className="topbar-title">Office Dashboard</h1></div>
      <div className="p-5 space-y-4">
        <WelcomeGuide technician={false}/>
        <Link href="/actions" className="block rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-sm hover:border-blue-500"><strong>☑ My Actions</strong><p className="text-gray-600 mt-1">Review approvals, warehouse issues and other tasks requiring your attention →</p></Link>
        <WarehousePendingActions requests={requests} canManage={rights.canManageRequests}/>
        <div className="card">
          <h2 className="text-sm font-semibold">Office stock management</h2>
          <p className="text-sm text-gray-600 mt-2">You can view warehouse balances, receive supplier stock and review transaction history. No service van is assigned to this account.</p>
          <div className="flex flex-wrap gap-3 mt-4">
            <a className="btn btn-primary" href="/receive">Receive Stock</a>
            <a className="btn" href="/warehouse">Warehouse</a>
            <a className="btn" href="/logs">Transaction History</a>
          </div>
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold mb-3">Recent company stock activity</h2>
          {recentLogs.length===0 ? <p className="text-sm text-gray-500">No transactions recorded.</p> :
          <div className="space-y-2">{recentLogs.slice(0,8).map(log=>
            <div className="border-b border-gray-100 py-2 text-sm" key={log.id}>
              <span className="font-medium">{typeLabels[log.type]??log.type}</span>
              {' — '}{log.quantity} {log.product_name}
              <p className="text-xs text-gray-500">{log.reference??'No reference'}</p>
            </div>
          )}</div>}
        </div>
      </div>
    </div>
  }
  const working=await getWorkingVans(searchParams?.van)
  const workingVanNumber=working.vans.find(v=>v.id===working.selectedId)?.van_number??null
  const [stats, stockItems, recentLogs, products, standards] = await Promise.all([
    getDashboardStats(working.selectedId??undefined),
    getMyStock(working.selectedId??undefined),
    getActivityLog(undefined,working.selectedId??undefined),
    getProducts(),
    getWorkingVanStandards(working.selectedId??undefined),
  ])
  const displayRows = buildStockDisplayRows(products, stockItems, standards)
  const lowItems = displayRows.filter(s => s.status === 'Critical' || s.status === 'Low')
  const [warehouseRequests,warehouseRights]=user?.access?.office_access
    ? await Promise.all([getWarehouseRequests(),getMyWarehouseRights()])
    : [[],{canManageRequests:false}]

  return (
    <div>
      {/* Top bar — van number now shown prominently here */}
      <div className="topbar">
        <div className="flex items-center gap-3">
          <h1 className="topbar-title">Dashboard</h1>
          {workingVanNumber && (
            <span className="badge badge-blue text-sm font-semibold px-3 py-1">
              🚐 {workingVanNumber}
            </span>
          )}
        </div>
        {user?.role === 'admin' && <a href="/adjust-stock" className="btn btn-primary btn-sm">
          + Adjust stock
        </a>}
      </div>

      <div className="p-5">
        <WelcomeGuide technician={Boolean(user?.access?.technician_access)}/>
        <Link href="/actions" className="block rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-sm mb-4 hover:border-blue-500"><strong>☑ My Actions</strong><p className="text-gray-600 mt-1">Check deliveries and transfers awaiting your confirmation →</p></Link>
        {user?.access?.office_access&&<WarehousePendingActions requests={warehouseRequests} canManage={warehouseRights.canManageRequests}/>}
        <WorkingVanSelector vans={working.vans} selectedId={working.selectedId} defaultId={working.defaultId}/>

        {lowItems.length > 0 && (
          <div className="alert alert-warning">
            ⚠️ {lowItems.length} item{lowItems.length !== 1 ? 's are' : ' is'} running low — check{' '}
            <a href="/stock" className="underline font-medium">My Van Stock</a> for details.
          </div>
        )}

        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="metric-card">
            <div className="metric-label">Stock product types</div>
            <div className="metric-value">{displayRows.filter(s => s.quantity > 0).length}</div>
            <div className="metric-sub">with a positive balance</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Low stock alerts</div>
            <div className="metric-value text-amber-600">{lowItems.length}</div>
            <div className="metric-sub">need restocking soon</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Transfers today</div>
            <div className="metric-value">{stats?.transfersToday ?? 0}</div>
            <div className="metric-sub">logged movements</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Stock issues today</div>
            <div className="metric-value">{stats?.issuedToday ?? 0}</div>
            <div className="metric-sub">recorded transactions</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium">Stock overview</h2>
              {workingVanNumber && (
                <span className="badge badge-blue font-semibold">{workingVanNumber}</span>
              )}
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Item</th>
                  <th className="table-header">Qty</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((s) => {
                  const st = s.status
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{s.product?.name}</td>
                      <td className="table-cell">{s.quantity} {s.product?.stock_unit ?? 'ea'}</td>
                      <td className="table-cell">
                        <span className={`badge ${st === 'Critical' ? 'badge-critical' : st === 'Low' ? 'badge-low' : 'badge-ok'}`}>{st}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="text-sm font-medium mb-3">Recent activity</h2>
            <div className="space-y-0">
              {recentLogs.slice(0, 6).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0"
                >
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm text-gray-800">
                      {typeLabels[log.type] ?? log.type} — {log.quantity} {stockItems.find(s => s.product_id === log.product_id)?.product?.stock_unit ?? 'ea'} {log.product_name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.created_at).toLocaleTimeString('en-AU', {
                        hour: '2-digit', minute: '2-digit'
                      })} · {log.reference ?? '—'}
                    </div>
                  </div>
                </div>
              ))}
              {recentLogs.length === 0 && (
                <p className="text-sm text-gray-400 py-2">No activity recorded yet.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
