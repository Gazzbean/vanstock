'use client'

import {useState,useTransition} from 'react'
import {processWarehouseRequest} from '@/lib/actions'

type Request={id:string;warehouse_id:string;van_id:string;product_id:string;quantity:number;reference:string;status:string;created_at:string}

export default function WarehouseRequestQueue({requests,warehouses,vans,products,canManage,writesEnabled}:{
  requests:Request[];warehouses:{id:string;name:string}[];
  vans:{id:string;van_number:string}[];products:{id:string;name:string;unit:string}[];
  canManage:boolean;writesEnabled:boolean
}){
  const [busy,start]=useTransition()
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [completed,setCompleted]=useState<string[]>([])
  const name=(list:{id:string;name?:string;van_number?:string}[],id:string)=>{
    const item=list.find(x=>x.id===id);return item?.name??item?.van_number??'Unknown'
  }
  function act(id:string,action:'approve'|'reject'|'fulfil'){
    setError('');setSuccess('')
    start(async()=>{
      try{
        const result=await processWarehouseRequest(id,action)
        if(result.error)setError(result.error)
        else{setCompleted(prev=>[...prev,id]);setSuccess('Request updated. Refresh the page to see current status.')}
      }catch{setError('Request could not be processed. Refresh before retrying.')}
    })
  }
  return <section className="card mt-4">
    <h2 className="text-sm font-medium mb-2">Warehouse replenishment requests</h2>
    <p className="text-xs text-gray-500 mb-3">Approval does not move stock. Fulfilment transfers stock once, provided the warehouse has sufficient balance.</p>
    {error&&<p role="alert" className="text-sm text-red-700 mb-2">{error}</p>}
    {success&&<p role="status" className="text-sm text-green-700 mb-2">{success}</p>}
    {requests.length===0?<p className="text-sm text-gray-500">No recorded requests.</p>:<div className="overflow-x-auto"><table className="w-full"><thead><tr>
      {['Date','Warehouse','Van','Product','Qty','Reference','Status','Action'].map(x=><th key={x} className="table-header">{x}</th>)}
    </tr></thead><tbody>{requests.map(r=><tr key={r.id}>
      <td className="table-cell">{new Date(r.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</td>
      <td className="table-cell">{name(warehouses,r.warehouse_id)}</td><td className="table-cell">{name(vans,r.van_id)}</td>
      <td className="table-cell">{name(products,r.product_id)}</td><td className="table-cell">{r.quantity}</td>
      <td className="table-cell">{r.reference}</td><td className="table-cell">{r.status}</td>
      <td className="table-cell"><div className="flex gap-1">{canManage&&!completed.includes(r.id)&&r.status==='pending'&&<>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>act(r.id,'approve')}>Approve</button>
        <button type="button" className="btn" disabled={busy} onClick={()=>act(r.id,'reject')}>Reject</button>
      </>}{canManage&&!completed.includes(r.id)&&r.status==='approved'&&<button type="button" className="btn btn-primary" disabled={busy||!writesEnabled} onClick={()=>act(r.id,'fulfil')}>Fulfil & transfer</button>}</div></td>
    </tr>)}</tbody></table></div>}
  </section>
}
