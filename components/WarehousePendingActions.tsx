import Link from 'next/link'

type PendingRequest = {id:string;reference:string;quantity:number;status:string;requested_by_label:string}

export default function WarehousePendingActions({requests,canManage}:{requests:PendingRequest[];canManage:boolean}){
  const pending=canManage?requests.filter(r=>r.status==='pending'||r.status==='approved'):[]
  return <section className="card mb-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">Pending Actions — Warehouse</h2>
      <Link href="/warehouse" className="text-sm text-blue-700 underline">Open Warehouse</Link>
    </div>
    {!canManage?<p className="mt-2 text-sm text-gray-600">Replenishment requests and their decisions are available in Warehouse.</p>:
      pending.length===0?<p className="mt-2 text-sm text-gray-600">No replenishment approvals or fulfilments pending.</p>:
      <div className="mt-3 space-y-2">{pending.slice(0,8).map(r=><div key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 pb-2 text-sm">
        <span>{r.reference} — quantity {r.quantity}</span>
        <span className={r.status==='pending'?'text-amber-700':'text-blue-700'}>{r.status==='pending'?'Awaiting approval':'Awaiting fulfilment'}</span>
      </div>)}
      {pending.length>8&&<p className="text-xs text-gray-500">Plus {pending.length-8} more requests.</p>}
      </div>}
  </section>
}
