const stages=['Requested','Approved','Issued','Received'] as const

export default function RequestProgress({status,hasDiscrepancy=false}:{status:string;hasDiscrepancy?:boolean}){
  const completed=status==='fulfilled'?4:status==='issued'?3:status==='approved'?2:status==='pending'?1:0
  if(status==='rejected')return <p className="mt-2 text-xs font-semibold text-red-700">Request rejected — no stock moved</p>
  return <div className="mt-2" aria-label={`Replenishment progress: ${completed} of 4 stages complete${hasDiscrepancy?', receipt on hold':''}`}>
    <div className="grid grid-cols-4 gap-1">{stages.map((stage,index)=>{
      const done=index<completed
      const next=index===completed&&completed<4
      return <span key={stage} className={`rounded-md px-1 py-1 text-center text-[10px] leading-tight font-medium border ${done?'bg-green-50 border-green-200 text-green-800':next?'bg-amber-50 border-amber-300 text-amber-900':'bg-gray-50 border-gray-200 text-gray-500'}`}>
        {done?'✓ ':''}{stage}
      </span>
    })}</div>
    {hasDiscrepancy&&<p className="mt-1 text-xs font-medium text-orange-800">Receiving discrepancy — awaiting reconciliation</p>}
  </div>
}
