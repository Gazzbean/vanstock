import {redirect} from 'next/navigation'
import {getCurrentUserDisplay,getVanTransferWorkspace} from '@/lib/actions'
import VanTransferWorkflow from '@/components/VanTransferWorkflow'
import WorkflowGuide from '@/components/WorkflowGuide'

export default async function VanTransfersPage(){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(!user.access?.office_access&&!user.access?.technician_access)redirect('/dashboard')
 const workspace=await getVanTransferWorkspace()
 return <div>
  <div className="topbar"><h1 className="topbar-title">Van-to-van transfers</h1></div>
  <div className="p-5 max-w-6xl">
   <WorkflowGuide title="Van transfer · receiving confirmation" stages={[{label:'Request'},{label:'Await receipt'},{label:'Complete'}]} current={0} help={['The source van requests a transfer and reviews the quantity.','The receiving technician checks the goods and confirms or rejects.','Stock changes only after receiving confirmation.']} helpHref="/help#transfer"/>
   <div className="alert alert-info mb-4">A request does not move stock. The receiving technician confirms the transfer before both van balances change. Management can intervene with an explanation.</div>
   <VanTransferWorkflow {...workspace}/>
  </div>
 </div>
}
