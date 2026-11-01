'use client'
import {useState,type ReactNode} from 'react'
import Link from 'next/link'

type Section='catalogue'|'suppliers'|'standards'|'consumables'|'access'
const tabs:{id:Section;label:string;subtitle:string}[]=[
 {id:'catalogue',label:'Products',subtitle:'Master products, ServiceM8 links and CSV import'},
 {id:'suppliers',label:'Suppliers & bins',subtitle:'Set up suppliers, pack sizes and storage positions'},
 {id:'standards',label:'Van standards',subtitle:'Set van stock targets and view shortages'},
 {id:'consumables',label:'Consumables',subtitle:'Configure the four quick-use buttons and product groups'},
 {id:'access',label:'Users & access',subtitle:'User permissions and system summary'},
]
export default function AdminTabbedSections({catalogue,suppliers,standards,consumables,access}:{
 catalogue:ReactNode;suppliers:ReactNode;standards:ReactNode;consumables:ReactNode;access:ReactNode
}){
 const [active,setActive]=useState<Section>('catalogue')
 const sections={catalogue,suppliers,standards,consumables,access}
 const selected=tabs.find(t=>t.id===active)!
 return <div className="space-y-4">
  <nav aria-label="Administration sections" className="flex flex-wrap gap-2 rounded-lg bg-white p-3 border border-gray-200">
   {tabs.map(t=><button key={t.id} type="button" aria-current={active===t.id?'page':undefined}
    onClick={()=>setActive(t.id)}
    className={active===t.id?'btn btn-primary':'btn border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}>
    {t.label}
   </button>)}
  </nav>
  <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
   <div className="font-semibold text-sm text-gray-800">{selected.label}</div>
   <p className="text-xs text-gray-600 mt-1">{selected.subtitle}</p>
   {active==='suppliers'&&<p className="text-xs text-gray-600 mt-2">This section only defines supplier details, purchase units and bin assignments. To add physical quantities, use <Link href="/receive" className="text-blue-700 underline font-medium">Receive Stock</Link> in the main menu.</p>}
  </div>
  <div key={active}>{sections[active]}</div>
 </div>
}
