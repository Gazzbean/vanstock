// ============================================================
// app/dashboard/page.tsx
// The main dashboard page — shows summary stats and recent activity.
// This is a Server Component: it fetches data on the server
// before sending the page to the browser (faster, more secure).
// ============================================================

import { getDashboardStats, getMyStock, getActivityLog } from '@/lib/actions'

// Status helper — returns the right badge style for a stock level
function stockStatus(qty: number, min: number) {
  if (qty <= 0)   return { label: 'Critical', cls: 'badge-critical' }
  if (qty < min)  return { label: 'Low',      cls: 'badge-low'      }
  return               { label: 'OK',        cls: 'badge-ok'       }
}

// Friendly labels for log entry types
const typeLabels: Record<string, string> = {
  issue:       'Issued to customer',
  return:      'Return from customer',
  'van-to-van':'Van transfer',
  depot:       'Returned to depot',
  adjust:      'Stock adjustment',
}

export default async function DashboardPage() {
  // Fetch all data in parallel (faster than one at a time)
  const [stats, stockItems, recentLogs] = await Promise.all([
    getDashboardStats(),
    getMyStock(),
    getActivityLog(),
  ])

  const lowItems = stockItems.filter(
    (s) => s.quantity < (s.product?.min_stock ?? 0)
  )

  return (
    <div>
      {/* Top bar */}
      <div className="topbar">
        <h1 className="topbar-title">Dashboard</h1>
        <a href="/stock" className="btn btn-primary btn-sm">
          + Adjust stock
        </a>
      </div>

      <div className="p-5">

        {/* Low stock warning banner */}
        {lowItems.length > 0 && (
          <div className="alert alert-warning">
            ⚠️ {lowItems.length} item{lowItems.length !== 1 ? 's are' : ' is'} running low — check{' '}
            <a href="/stock" className="underline font-medium">My Van Stock</a> for details.
          </div>
        )}

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="metric-card">
            <div className="metric-label">Total items on van</div>
            <div className="metric-value">{stats?.totalItems ?? 0}</div>
            <div className="metric-sub">across {stockItems.length} product types</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Low stock alerts</div>
            <div className="metric-value text-amber-600">{stats?.lowStockCount ?? 0}</div>
            <div className="metric-sub">need restocking soon</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Transfers today</div>
            <div className="metric-value">{stats?.transfersToday ?? 0}</div>
            <div className="metric-sub">logged movements</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Items issued today</div>
            <div className="metric-value">{stats?.issuedToday ?? 0}</div>
            <div className="metric-sub">to customers</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">

          {/* Stock overview table */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium">Stock overview</h2>
              <span className="badge badge-blue">Van #04</span>
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
                {stockItems.map((s) => {
                  const st = stockStatus(s.quantity, s.product?.min_stock ?? 0)
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{s.product?.name}</td>
                      <td className="table-cell">{s.quantity}</td>
                      <td className="table-cell">
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Recent activity */}
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
                      {typeLabels[log.type] ?? log.type} — {log.quantity}× {log.product_name}
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
