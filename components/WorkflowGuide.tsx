'use client'

import {useState} from 'react'
import Link from 'next/link'

export type WorkflowStage={label:string;description?:string}

export default function WorkflowGuide({title,stages,current,help,helpHref}:{title:string;stages:WorkflowStage[];current:number;help:string[];helpHref?:string}){
 const [open,setOpen]=useState(false)
 return <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 sm:p-4 mb-4" aria-label={`${title} progress`}>
  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
   <h2 className="font-semibold text-sm text-gray-900">{title}</h2>
   <button type="button" className="text-blue-700 text-sm font-medium underline min-h-11" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?'Hide guidance':'ⓘ How it works'}</button>
  </div>
  <ol className="grid gap-2" style={{gridTemplateColumns:`repeat(${stages.length},minmax(0,1fr))`}}>
   {stages.map((s,i)=><li key={s.label} aria-current={i===current?'step':undefined} className={`rounded-lg border px-2 py-2 text-center text-xs sm:text-sm ${i<current?'border-green-200 bg-green-50 text-green-800':i===current?'border-amber-400 bg-amber-50 text-amber-900 font-semibold':'border-gray-200 bg-white text-gray-500'}`}>
    <div aria-hidden>{i<current?'✓':i+1}</div><div>{s.label}</div>
   </li>)}
  </ol>
  {open&&<div className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-700">
    <ol className="list-decimal ml-5 space-y-1">{help.map((step,i)=><li key={i}>{step}</li>)}</ol>
    {helpHref&&<Link href={helpHref} className="inline-block mt-3 text-blue-700 underline">Read full SOP →</Link>}
  </div>}
 </section>
}
