import { redirect } from 'next/navigation'
// ============================================================
// app/transfer/page.tsx
// Record any stock movement — issue, return, van-to-van, depot.
// The form is a Client Component; the page shell is a Server Component.
// ============================================================

import { getMyStock, getProducts, getActivityLog, getWorkingVans, getCurrentUserDisplay, getConsumablesAssignments, getJobMaterialAllocations } from '@/lib/actions'
import WorkingVanSelector from '@/components/WorkingVanSelector'
import TransferForm from '@/components/TransferForm'

function processorLabel(name:string|null|undefined){return name?name+' ('+name.trim().split(/\s+/).map(p=>p[0]?.toUpperCase()??'').join('')+')':'Unknown user'}

const typeLabels: Record<string, string> = {
  issue:        'Issued',
  return:       'Returned',
  'van-to-van': 'Transferred',
  depot:        'Depot return',
  adjust:       'Adjusted',
}

export default async function TransferPage({searchParams}:{searchParams:{van?:string}}) {
  const user=await getCurrentUserDisplay()
  if(!user)redirect('/login')
  if(!user.access?.technician_access)redirect('/dashboard')
  const working=await getWorkingVans(searchParams?.van)
  const [stockItems, products, todayLogs, consumables, allocations] = await Promise.all([
    getMyStock(working.selectedId??undefined),
    getProducts(),
    getActivityLog(undefined,working.selectedId??undefined),
    getConsumablesAssignments(),
    getJobMaterialAllocations(working.selectedId??undefined),
  ])

  // Filter to just today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEntries = todayLogs.filter(
    (l) => new Date(l.created_at) >= today && l.van_id === working.selectedId
  )

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">Materials Used</h1>
      </div>

      <div className="p-5">
        <WorkingVanSelector vans={working.vans} selectedId={working.selectedId} defaultId={working.defaultId} />
        <div className="alert alert-info">
          ℹ️ Record parts and consumables used on jobs here. Materials left on site stay allocated until used or returned.
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Transfer form — Client Component */}
          {working.selectedId&&<TransferForm selectedVanId={working.selectedId} products={products} stockItems={stockItems} consumables={consumables} allocations={allocations} />}

          {/* Today's transfers */}
          <div className="card">
            <h2 className="text-sm font-medium mb-3">Today's stock movements</h2>
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
                        {typeLabels[log.type] ?? log.type} — {log.quantity} {products.find(p => p.id === log.product_id)?.stock_unit ?? 'ea'} {log.product_name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(log.created_at).toLocaleTimeString('en-AU', {
                          hour: '2-digit', minute: '2-digit'
                        })} · {log.reference ?? '—'} · Processed by {((log.profile as any)?.initials ?? processorLabel((log.profile as any)?.full_name).split('(').pop()?.replace(')',''))}
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
