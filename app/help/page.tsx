import Link from 'next/link'
import ResetWelcomeButton from '@/components/ResetWelcomeButton'

const guides=[
 {id:'supplier',code:'VS-SOP-001',title:'Receive stock from a supplier',steps:['Check the supplier delivery docket against the goods.','Select full packs or loose items, the product and destination.','Enter the supplier reference and review the converted stock quantity.','Confirm once. Verify the receipt appears in History.']},
 {id:'used',code:'VS-SOP-002',title:'Record materials used',steps:['Check the working van shown at the top of the page.','Choose the product, quantity and job or customer reference.','For materials left on site, record the site location and reason.','Review the deduction and confirm; check History.']},
 {id:'transfer',code:'VS-SOP-003',title:'Transfer between vans',steps:['Select the source van, destination van and product.','Choose full packs or individual items. Check the actual stock quantity.','Enter a reason and submit the request. No stock changes yet.','The receiving technician checks the delivered goods and confirms or rejects the transfer.']},
 {id:'replenishment',code:'VS-SOP-004',title:'Replenish a van from the warehouse',steps:['The technician requests stock for an authorised van.','The manager or authorised office user approves the request.','Warehouse personnel physically issue the goods and record warehouse issue.','The receiving technician checks and confirms delivery. Stock changes only at this final step.']},
 {id:'returns',code:'VS-SOP-005',title:'Return stock to the warehouse',steps:['Identify the source van and items being returned.','Check the product and quantity, and record the reason.','Submit the return using an authorised warehouse workflow.','Check the recorded movement in History.']},
 {id:'adjustments',code:'VS-SOP-006',title:'Stock adjustments and discrepancies',steps:['Do not compensate for a discrepancy by recording a false receipt or issue.','Notify an authorised manager and check the transaction history.','The authorised user enters a documented correction and reference.','Review previous and corrected balances before confirming.']},
 {id:'stocktake',code:'VS-SOP-007',title:'Stocktake',steps:['Count physical stock by product and location.','Compare physical counts with the recorded balance.','Investigate discrepancies and retain the count reference.','An authorised person confirms the audited adjustment.']},
 {id:'accounts',code:'VS-SOP-008',title:'Accounts and working vans',steps:['Sign in using your own account; never share credentials.','Verify the assigned working van before a stock movement.','Select another van only if authorised; changes are logged.','Contact an Administrator if your van or permissions are incorrect.']},
]

export default function HelpPage(){return <div>
 <div className="topbar"><h1 className="topbar-title">Help & SOPs</h1></div>
 <div className="p-4 sm:p-5 max-w-4xl space-y-4">
  <div className="rounded-xl bg-blue-50 border border-blue-200 p-4"><h2 className="font-semibold">Simplicity Air · VanStock guidance</h2><p className="text-sm text-gray-600 mt-1">Find a procedure below. Each stock-changing screen also explains the confirmation required. Ask an authorised manager before correcting an uncertain transaction.</p></div>
  {guides.map(g=><details key={g.id} id={g.id} className="card scroll-mt-5 group">
   <summary className="flex items-center gap-3 cursor-pointer min-h-11 text-sm font-semibold"><span className="text-xs text-blue-700">{g.code}</span>{g.title}<span className="ml-auto text-gray-500">⌄</span></summary>
   <ol className="list-decimal pl-5 mt-3 space-y-2 text-sm text-gray-700">{g.steps.map((s,i)=><li key={i}>{s}</li>)}</ol>
   <p className="text-xs text-gray-500 mt-3">Guidance for the trial application. If goods or recorded quantities differ, stop and report the discrepancy before confirming.</p>
  </details>)}
  <Link href="/actions" className="inline-block text-blue-700 underline">Return to My Actions</Link>
  <div><ResetWelcomeButton/></div>
 </div>
 </div>}
