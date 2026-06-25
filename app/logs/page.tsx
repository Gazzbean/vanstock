// ============================================================
// app/logs/page.tsx
// Full audit trail of every stock change.
// The filter dropdown uses a URL search param so the page
// can be bookmarked and shared by managers.
// ============================================================

import { getActivityLog } from '@/lib/actions'

const typeLabels: Record<string, string> = {
  issue:        'Issue',
  return:       'Return',
  'van-to-van': 'Van transfer',
  depot:        'Depot return',
  adjust:       'Adjustment',
}

const typeBadge: Record<string, string> = {
  issue:        'badge-blue',
  return:       'badge-ok',
  'van-to-van': 'badge-gray',
  depot:        'badge-gray',
  adjust:       'badge-low',
}

// searchParams lets the filter work via the URL (e.g. /logs?type=issue)
export default async function LogsPage({
  searchParams,
}: {
  searchParams: { type?: string }
}) {
  const filterType = searchParams.type ?? 'all'
  const logs = await getActivityLog(filterType)

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">Activity Log</h1>

        {/* Filter — links update the URL, which triggers a server re-fetch */}
        <div className="flex gap-1">
          {['all', 'issue', 'return', 'van-to-van', 'depot', 'adjust'].map((t) => (
            <a
              key={t}
              href={`/logs?type=${t}`}
              className={`btn btn-sm ${filterType === t ? 'btn-primary' : ''}`}
            >
              {t === 'all' ? 'All' : typeLabels[t] ?? t}
            </a>
          ))}
        </div>
      </div>

      <div className="p-5">
        <div className="card">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Time</th>
                <th className="table-header">Type</th>
                <th className="table-header">Item</th>
                <th className="table-header">Qty</th>
                <th className="table-header">Reference</th>
                <th className="table-header">Van</th>
                <th className="table-header">User</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="table-cell text-gray-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleDateString('en-AU', {
                      day: 'numeric', month: 'short'
                    })}{' '}
                    {new Date(log.created_at).toLocaleTimeString('en-AU', {
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${typeBadge[log.type] ?? 'badge-gray'}`}>
                      {typeLabels[log.type] ?? log.type}
                    </span>
                  </td>
                  <td className="table-cell font-medium">{log.product_name}</td>
                  <td className="table-cell font-medium">{log.quantity}</td>
                  <td className="table-cell text-gray-500">{log.reference ?? '—'}</td>
                  <td className="table-cell text-gray-400">{(log.van as any)?.van_number ?? '—'}</td>
                  <td className="table-cell text-gray-500">{(log.profile as any)?.full_name ?? '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-cell text-center text-gray-400 py-6">
                    No log entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
