import {redirect} from 'next/navigation'
import {getCylinderCustodyOverview,getCurrentUserDisplay} from '@/lib/actions'
import CylinderCustodyRegister from '@/components/CylinderCustodyRegister'

function perthDay(){
 const items=new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Perth',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const part=(kind:string)=>items.find(x=>x.type===kind)?.value??''
 return `${part('year')}-${part('month')}-${part('day')}`
}

export default async function CylindersPage(){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(user.role!=='admin'&&!user.access?.office_access&&!user.access?.technician_access)
   redirect('/dashboard')
 const overview=await getCylinderCustodyOverview()
 return <div>
  <div className="topbar"><h1 className="topbar-title">Cylinder Custody</h1></div>
  <div className="p-5 space-y-4">
   <p className="text-sm text-gray-600">Track individual physical cylinders, supplier ownership, return dates, serials and custody changes. This is not a substitute for refrigerant kg purchase, usage, recovery and disposal records.</p>
   <CylinderCustodyRegister {...overview} perthDay={perthDay()}/>
   <p className="text-xs text-gray-500">Only Administrators can register or change custody during initial commissioning. Each change requires an audit reference and is retained in immutable history. Hire dates are blank until supported by supplier terms.</p>
  </div>
 </div>
}
