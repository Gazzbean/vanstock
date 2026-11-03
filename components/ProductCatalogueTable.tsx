'use client'

import { useMemo, useState } from 'react'
import EditProductModal from '@/components/EditProductModal'
import RemoveProductButton from '@/components/RemoveProductButton'

type Product = { id:string; name:string; category:string; stock_unit:string|null; min_stock:number; archived_at?:string|null }

export default function ProductCatalogueTable({products,archiveEnabled}:{products:Product[];archiveEnabled:boolean}) {
  const [name,setName]=useState('')
  const [category,setCategory]=useState('')
  const [unit,setUnit]=useState('')
  const [sort,setSort]=useState<'name'|'category'|'unit'|'minimum'>('name')
  const [direction,setDirection]=useState<1|-1>(1)
  const categories=useMemo(()=>Array.from(new Set(products.map(p=>p.category))).sort(),[products])
  const units=useMemo(()=>Array.from(new Set(products.map(p=>p.stock_unit??'ea'))).sort(),[products])
  const filtered=useMemo(()=>products.filter(p=>p.name.toLowerCase().includes(name.trim().toLowerCase()) &&
    (!category || p.category===category) && (!unit || (p.stock_unit??'ea')===unit))
    .sort((a,b)=>direction*(sort==='minimum'?a.min_stock-b.min_stock:
      sort==='category'?a.category.localeCompare(b.category):
      sort==='unit'?(a.stock_unit??'ea').localeCompare(b.stock_unit??'ea'):a.name.localeCompare(b.name))),
  [products,name,category,unit,sort,direction])
  function sortBy(next:typeof sort) { if(sort===next)setDirection(d=>d===1?-1:1);else{setSort(next);setDirection(1)} }
  const sortable=(label:string,key:typeof sort)=><button type="button" onClick={()=>sortBy(key)} className="text-left hover:underline" aria-label={'Sort by '+label}>{label}{sort===key?(direction===1?' ↑':' ↓'):''}</button>
  return <>
    <p className="text-xs text-gray-500 mb-3">Default van minimum is used only where no van-specific minimum is set. Warehouse reorder thresholds are separate.</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      <label className="text-xs text-gray-600">Search product name<input aria-label="Search product name" className="form-input mt-1" value={name} onChange={e=>setName(e.target.value)} placeholder="Search products"/></label>
      <label className="text-xs text-gray-600">Category<select className="form-input mt-1" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="text-xs text-gray-600">Stock unit<select className="form-input mt-1" value={unit} onChange={e=>setUnit(e.target.value)}><option value="">All units</option>{units.map(u=><option key={u}>{u}</option>)}</select></label>
    </div>
    <div className="overflow-x-auto"><table className="w-full"><thead><tr>
      <th className="table-header">{sortable('Name','name')}</th><th className="table-header">{sortable('Category','category')}</th>
      <th className="table-header">{sortable('Unit','unit')}</th><th className="table-header">{sortable('Default van minimum','minimum')}</th><th className="table-header">Actions</th>
    </tr></thead><tbody>{filtered.map(p=><tr key={p.id} className="hover:bg-gray-50">
      <td className="table-cell font-medium">{p.name}{p.archived_at&&<span className="text-xs text-gray-500 ml-2">(Archived)</span>}</td>
      <td className="table-cell"><span className="badge badge-gray">{p.category}</span></td><td className="table-cell text-gray-500">{p.stock_unit??'ea'}</td>
      <td className="table-cell text-gray-600">{p.min_stock}</td><td className="table-cell"><div className="flex gap-2"><EditProductModal product={p}/><RemoveProductButton productId={p.id} archived={!!p.archived_at} enabled={archiveEnabled}/></div></td>
    </tr>)}{filtered.length===0&&<tr><td colSpan={5} className="table-cell text-center text-gray-400 py-4">No matching products.</td></tr>}</tbody></table></div>
    <p className="text-xs text-gray-500 mt-2">Showing {filtered.length} of {products.length} products</p>
  </>
}
