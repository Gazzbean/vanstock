'use client'

import Link from 'next/link'
import {useEffect,useState} from 'react'

const key='vanstock-welcome-dismissed-v1'

export default function WelcomeGuide({technician}:{technician:boolean}){
 const [visible,setVisible]=useState(false)
 useEffect(()=>{try{setVisible(localStorage.getItem(key)!=='yes')}catch{setVisible(true)}},[])
 if(!visible)return null
 return <section aria-label="First-time VanStock guidance" className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4 mb-4 space-y-3">
  <div className="flex justify-between gap-3 items-start"><div><h2 className="font-semibold">Welcome to Simplicity Air VanStock</h2><p className="text-sm text-gray-600 mt-1">A quick guide to your first stock transaction.</p></div><button type="button" className="text-sm text-gray-600 underline min-h-11" onClick={()=>{try{localStorage.setItem(key,'yes')}catch{}setVisible(false)}}>Dismiss</button></div>
  <ol className="list-decimal pl-5 text-sm space-y-1">{technician?<>
    <li>Check your assigned Working Van.</li><li>Open My Actions to see deliveries and transfers awaiting confirmation.</li><li>Record materials used on jobs and request replenishment when stock runs low.</li>
  </>:<><li>Open My Actions for outstanding approvals and warehouse issues.</li><li>Use Warehouse and Fleet Stock to inspect balances.</li><li>Use your assigned permissions to process supplier receipts.</li></>}</ol>
  <Link href="/help" className="inline-block text-sm text-blue-700 font-semibold underline">Open Help & SOPs →</Link>
 </section>
}
