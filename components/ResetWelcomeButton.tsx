'use client'

import {useRouter} from 'next/navigation'

export default function ResetWelcomeButton(){
 const router=useRouter()
 return <button type="button" className="btn min-h-11" onClick={()=>{
  try{localStorage.removeItem('vanstock-welcome-dismissed-v1')}catch{}
  router.push('/dashboard')
 }}>Show first-time guide again</button>
}
