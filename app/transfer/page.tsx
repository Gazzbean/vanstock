// ============================================================
// app/transfer/page.tsx
// Record any stock movement — issue, return, van-to-van, depot.
// The form is a Client Component; the page shell is a Server Component.
// ============================================================

import { getMyStock, getProducts, getActivityLog } from '@/lib/actions'
import TransferForm from '@/components/TransferForm'

const typeLabels: Record<string, string> = {
  issue:        'Issued',
  return:       'Returned',
  'van-to-van': 'Transferred',
  depot:        'Depot return',
  adjust:       'Adjusted',
}

export default async function TransferPage() {
  const [stockItems, products, todayLogs] = await Promise.all([
    getMyStock(),
    getProducts(),
    getActivityLog(),
  ])

  // Filter to just today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEntries = todayLogs.filter(
    (l) => new Date(l.created_at) >= today
  )

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">Transfer Stock</h1>
      </div>

      <div className="p-5">
        <div className="alert alert-info">
          ℹ️ All transfers are logged and visible to your manager. Changes take effect immediately.
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Transfer form — Client Component */}
          <TransferForm products={products} stockItems={stockItems} />

          {/* Today's transfers */}
          <div className="card">
            <h2 className="text-sm font-medium mb-3">Today's transfers</h2>
            {todayEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No transfers recorded today yet.</p>
            ) : (
              <div>
                {todayEntries.map((log) => (
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
