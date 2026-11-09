'use client'

import {useState} from 'react'
import Link from 'next/link'

export default function WorkflowHelp({title,steps,href}:{title:string;steps:string[];href:string}){
 const [open,setOpen]=useState(false)
 return <div className="text-sm">
  <button type="button" className="min-h-11 text-blue-700 font-medium underline" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Hide guidance':'ⓘ How it works'}</button>
  {open&&<div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-gray-800" role="region" aria-label={`${title} guidance`}>
   <p className="font-semibold mb-2">{title}</p>
   <ol className="list-decimal pl-5 space-y-2">{steps.map((step,index)=><li key={index}>{step}</li>)}</ol>
   <Link href={href} className="inline-block mt-3 text-blue-700 underline">Read full SOP →</Link>
  </div>}
 </div>
}
