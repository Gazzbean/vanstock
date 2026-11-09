import {redirect} from 'next/navigation'
import {getCurrentUserDisplay,getVanTransferWorkspace} from '@/lib/actions'
import VanTransferWorkflow from '@/components/VanTransferWorkflow'
import WorkflowHelp from '@/components/WorkflowHelp'

export default async function VanTransfersPage(){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(!user.access?.office_access&&!user.access?.technician_access)redirect('/dashboard')
 const workspace=await getVanTransferWorkspace()
 return <div>
  <div className="topbar"><h1 className="topbar-title">Van-to-van transfers</h1></div>
  <div className="p-5 max-w-6xl">
   <div className="card mb-4"><div className="flex flex-wrap justify-between items-center gap-2"><h2 className="text-sm font-semibold">Van transfer · Request → Receive → Complete</h2><WorkflowHelp title="Transfer stock between vans" steps={['Select the source and receiving vans, item and quantity, then submit the transfer request.','The receiving technician checks the delivered goods and confirms or rejects receipt.','Both van balances change only after the receiving confirmation.']} href="/help#transfer"/></div></div>
   <div className="alert alert-info mb-4">A request does not move stock. The receiving technician confirms the transfer before both van balances change. Management can intervene with an explanation.</div>
   <VanTransferWorkflow {...workspace}/>
  </div>
 </div>
}
