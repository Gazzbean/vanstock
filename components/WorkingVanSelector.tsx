'use client'
import {useRouter,usePathname,useSearchParams} from 'next/navigation'
export default function WorkingVanSelector({vans,selectedId,defaultId}:{vans:{id:string;van_number:string}[];selectedId:string|null;defaultId:string|null}){
 const router=useRouter(),path=usePathname(),params=useSearchParams()
 return <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mb-4">
  <div className="flex flex-wrap items-center gap-3">
   <label htmlFor="working-van" className="text-sm font-semibold">Working Van</label>
   <select className="form-input max-w-xs" id="working-van" value={selectedId??''} onChange={e=>{
    const q=new URLSearchParams(params.toString())
    if(e.target.value)q.set('van',e.target.value);else q.delete('van')
    router.push(path+'?'+q.toString())
   }}>
    <option value="">Select a van…</option>
    {vans.map(v=><option value={v.id} key={v.id}>{v.van_number}{v.id===defaultId?' (Default)':''}</option>)}
   </select>
  </div>
  <p className="text-xs text-gray-600 mt-2">Changing the working van changes which inventory you are viewing and issuing from. It does not transfer stock or change your default van. All transactions record your login and selected van.</p>
 </section>
}
