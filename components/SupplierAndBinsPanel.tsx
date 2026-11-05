'use client'
import {useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {addCatalogueSupplier,addSupplierPackage,setSupplierPackageActive,saveProductBin,updateCatalogueSupplier,updateSupplierPackage,deleteUnusedSupplierRecord} from '@/lib/actions'
import {isValidPackageConversion} from '@/lib/package-conversion'

type Product={id:string;name:string;stock_unit:string|null}
type Supplier={id:string;name:string;account_number:string|null;active:boolean}
type Option={id:string;product_id:string;supplier_id:string;supplier_code:string|null;package_label:string;purchase_unit:string;units_per_package:number;preferred:boolean;active:boolean}
type Bin={id:string;product_id:string;van_id:string|null;warehouse_id:string|null;bin_label:string}
type Location={id:string;name:string}
type UsageGroup={id:string;name:string;unit:string;quick_1:number;quick_2:number;quick_3:number;quick_4:number}
type UsageAssignment={product_id:string;group_id:string}
type Hint={product_id:string;supplier_name:string;supplier_part_number:string|null}
const purchaseUnits=[
  {value:'ea',label:'Each'}, {value:'pack',label:'Pack'}, {value:'box',label:'Box'},
  {value:'roll',label:'Roll'}, {value:'container',label:'Container'},
  {value:'cylinder',label:'Cylinder'}, {value:'kg',label:'Kilogram'}, {value:'m',label:'Metre'},
]
export default function SupplierAndBinsPanel({products,suppliers,options,bins,vans,warehouses,hints,usageGroups,usageAssignments}:{
 products:Product[];suppliers:Supplier[];options:Option[];bins:Bin[];
 vans:{id:string;van_number:string}[];warehouses:Location[];hints:Hint[];
 usageGroups:UsageGroup[];usageAssignments:UsageAssignment[]
}){
 const router=useRouter()
 const [name,setName]=useState(hints.find(h=>h.product_id===products[0]?.id)?.supplier_name??'')
 const [account,setAccount]=useState('')
 const [supplierId,setSupplierId]=useState(options.find(x=>x.product_id===products[0]?.id && x.preferred && x.active)?.supplier_id??options.find(x=>x.product_id===products[0]?.id && x.active)?.supplier_id??suppliers.find(s=>s.name.trim().toLowerCase()===hints.find(h=>h.product_id===products[0]?.id)?.supplier_name.trim().toLowerCase())?.id??suppliers[0]?.id??'')
 const [productId,setProductId]=useState(products[0]?.id??'')
 const [supplierCode,setSupplierCode]=useState(hints.find(h=>h.product_id===products[0]?.id)?.supplier_part_number??'')
 const [packageLabel,setPackageLabel]=useState('')
 const [purchaseUnit,setPurchaseUnit]=useState('pack')
 const [conversion,setConversion]=useState('')
 const [loc,setLoc]=useState(warehouses[0]?'warehouse:'+warehouses[0].id:vans[0]?'van:'+vans[0].id:'')
 const [bin,setBin]=useState('')
 const [supplierStatus,setSupplierStatus]=useState('')
 const [editingSupplier,setEditingSupplier]=useState('')
 const [supplierActive,setSupplierActive]=useState(true)
 const [editingPackage,setEditingPackage]=useState('')
 const [packageStatus,setPackageStatus]=useState('')
 const [binStatus,setBinStatus]=useState('')
 const [supplierBusy,startSupplier]=useTransition()
 const [packageBusy,startPackage]=useTransition()
 const [binBusy,startBin]=useTransition()
 const supplierOptions=options.filter(x=>x.product_id===productId)
 const supplierHint=hints.find(h=>h.product_id===productId)
 const selectedProduct=products.find(p=>p.id===productId)
 const stockUnit=selectedProduct?.stock_unit??'ea'
 const validConversion=conversion.trim()!==''&&isValidPackageConversion(Number(conversion),stockUnit)
 const selectedUsageGroup=usageGroups.find(g=>g.id===usageAssignments.find(a=>a.product_id===productId)?.group_id)
 const chosenLocation=loc.split(':')
 const currentBin=bins.find(x=>x.product_id===productId && (chosenLocation[0]==='van'?x.van_id===chosenLocation[1]:x.warehouse_id===chosenLocation[1]))
 function chooseLocation(v:string,pid=productId){setLoc(v);const [kind,id]=v.split(':');setBin(bins.find(b=>b.product_id===pid&&(kind==='van'?b.van_id===id:b.warehouse_id===id))?.bin_label??'');setBinStatus('')}
 function chooseProduct(id:string){
  setProductId(id);chooseLocation(loc,id);setPackageStatus('')
  setPackageLabel('');setSupplierCode('');setConversion(purchaseUnit==='ea'?'1':'')
  const preferred=options.find(x=>x.product_id===id && x.preferred && x.active)??options.find(x=>x.product_id===id && x.active)
  const hint=hints.find(h=>h.product_id===id)
  const match=suppliers.find(s=>s.name.trim().toLowerCase()===hint?.supplier_name.trim().toLowerCase())
  if(preferred)setSupplierId(preferred.supplier_id)
  else if(match)setSupplierId(match.id)
  if(hint){setSupplierCode(hint.supplier_part_number??'');setName(hint.supplier_name)}
 }
 function saveSupplier(){
  setSupplierStatus('')
  startSupplier(async()=>{try{const r=editingSupplier?await updateCatalogueSupplier(editingSupplier,name,account,supplierActive):await addCatalogueSupplier(name,account);setSupplierStatus(r.error||'Supplier saved. Stock and past receipts are unchanged.');if(!r.error){setName('');setAccount('');setEditingSupplier('');router.refresh()}}catch{setSupplierStatus('Could not confirm supplier. Refresh before retrying.')}})
 }
 function selectSupplierForEdit(id:string){
  setEditingSupplier(id)
  const s=suppliers.find(x=>x.id===id)
  setName(s?.name??'');setAccount(s?.account_number??'');setSupplierActive(s?.active??true);setSupplierStatus('')
 }
 function deleteRecord(kind:'supplier'|'package',id:string,label:string){
  if(window.prompt(`Permanently delete unused ${kind} "${label}"? Only records with no linked receipts or packages can be deleted. Type DELETE to confirm.`)!=='DELETE')return
  const run=kind==='supplier'?startSupplier:startPackage
  run(async()=>{try{
   const r=await deleteUnusedSupplierRecord(kind,id)
   const message=r.error??`${kind==='supplier'?'Supplier':'Package'} deleted. Historical receipts are unchanged.`
   if(kind==='supplier')setSupplierStatus(message);else setPackageStatus(message)
   if(!r.error){if(kind==='supplier'){setEditingSupplier('');setName('');setAccount('')}else setEditingPackage('');router.refresh()}
  }catch{if(kind==='supplier')setSupplierStatus('Could not delete supplier');else setPackageStatus('Could not delete package')}})
 }
 function savePackage(){
  setPackageStatus('')
  if(!validConversion){setPackageStatus('Enter a valid quantity per purchase unit. Counted items must use whole numbers.');return}
  startPackage(async()=>{try{const r=editingPackage?await updateSupplierPackage(editingPackage,supplierCode,packageLabel,purchaseUnit,Number(conversion)):await addSupplierPackage(productId,supplierId,supplierCode,packageLabel,purchaseUnit,Number(conversion));setPackageStatus(r.error||'Purchase option saved. Historical receipt quantities remain unchanged.');if(!r.error){setEditingPackage('');setPackageLabel('');setSupplierCode('');setConversion(purchaseUnit==='ea'?'1':'');router.refresh()}}catch{setPackageStatus('Could not confirm package. Refresh before retrying.')}})
 }
 function togglePackage(option:Option){
  const label=option.active?'retire':'reactivate'
  if(!window.confirm(`Are you sure you want to ${label} ${option.package_label}? Historical receipts will remain unchanged.`))return
  setPackageStatus('')
  startPackage(async()=>{
   try{
    const result=await setSupplierPackageActive(option.id,!option.active)
    if(result.error){setPackageStatus(result.error);return}
    setPackageStatus(`Purchase option ${option.active?'retired':'reactivated'}. Historical receipts were preserved.`)
    router.refresh()
   }catch{setPackageStatus('Could not confirm package status. Refresh before retrying.')}
  })
 }
 function saveBin(){
  setBinStatus('')
  startBin(async()=>{try{const [kind,id]=loc.split(':');const r=await saveProductBin(productId,kind as 'van'|'warehouse',id,bin);setBinStatus(r.error||'Bin location saved. Stock quantities are unchanged.')}catch{setBinStatus('Could not confirm bin. Refresh before retrying.')}})
 }
 return <section className="card mt-4">
   <h2 className="text-sm font-medium mb-1">Supplier packages and bin locations</h2>
   <p className="text-xs text-gray-500 mb-4">Phase 1B configuration only. Creating a purchase option does not receive stock, create a supplier order, or connect to ServiceM8.</p>
   <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div className="space-y-2">
     <h3 className="font-medium text-sm">{editingSupplier?'Edit supplier':'Add supplier'}</h3>
     <label className="form-label" htmlFor="edit-supplier">Manage existing supplier</label>
     <select id="edit-supplier" className="form-input" value={editingSupplier} onChange={e=>selectSupplierForEdit(e.target.value)}>
      <option value="">Add new supplier</option>
      {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{s.active?'':' (inactive)'}</option>)}
     </select>
     <label className="form-label" htmlFor="new-supplier">Supplier name</label>
     <input id="new-supplier" className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Sample supplier" maxLength={120}/>
     <label className="form-label" htmlFor="supplier-account">Account reference (optional)</label>
     <input id="supplier-account" className="form-input" value={account} onChange={e=>setAccount(e.target.value)} maxLength={100}/>
     {editingSupplier&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={supplierActive} onChange={e=>setSupplierActive(e.target.checked)}/> Active supplier</label>}
     <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary" disabled={supplierBusy||!name.trim()} onClick={saveSupplier}>{supplierBusy?'Saving supplier…':editingSupplier?'Save supplier changes':'Add supplier'}</button>
      {editingSupplier&&<button className="btn" type="button" disabled={supplierBusy} onClick={()=>deleteRecord('supplier',editingSupplier,name)}>Delete if unused</button>}
     </div>
     {supplierStatus&&<p role="status" className="text-xs mt-2">{supplierStatus}</p>}
     <p className="text-xs text-gray-500">Suppliers: {suppliers.length}. Use synthetic names until actual supplier configuration is approved.</p>
    </div>
    <div className="space-y-2">
     <h3 className="font-medium text-sm">Purchase package</h3>
     {editingPackage&&<p className="text-xs text-orange-800">Editing an existing purchase option. Changes apply to future receipts only. <button className="underline" type="button" onClick={()=>{setEditingPackage('');setPackageLabel('');setSupplierCode('');setConversion('')}}>Cancel edit</button></p>}
     <label className="form-label" htmlFor="package-product">Product</label>
     <select id="package-product" className="form-input" value={productId} disabled={!!editingPackage} onChange={e=>chooseProduct(e.target.value)}>
      {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
     <label className="form-label" htmlFor="package-supplier">Supplier</label>
     <p className="text-xs text-gray-500 mb-1">The existing preferred supplier is selected when one is recorded. Otherwise, choose a supplier to configure a new purchasing option.</p>
     {supplierHint&&<p className="text-xs text-blue-700 mb-1">Imported supplier: {supplierHint.supplier_name}. Confirm or add this supplier before creating a purchase package.</p>}
     <select id="package-supplier" className="form-input" value={supplierId} disabled={!!editingPackage} onChange={e=>setSupplierId(e.target.value)}>
      {suppliers.filter(s=>s.active||s.id===supplierId).map(s=><option key={s.id} value={s.id}>{s.name}{s.active?'':' (inactive)'}</option>)}
     </select>
     <label className="form-label" htmlFor="package-label">Supplier package description</label>
     <input id="package-label" className="form-input" value={packageLabel} onChange={e=>setPackageLabel(e.target.value)} placeholder="e.g. Pack of 500, Box of 100, Roll of 25 m" maxLength={100}/>
     <label className="form-label" htmlFor="package-code">Supplier part number (optional)</label>
     <input id="package-code" className="form-input" value={supplierCode} onChange={e=>setSupplierCode(e.target.value)} maxLength={120}/>
     <div className="grid grid-cols-2 gap-2">
      <div><label className="form-label" htmlFor="purchase-unit">Purchase unit</label>
       <select id="purchase-unit" className="form-input" value={purchaseUnit} onChange={e=>{setPurchaseUnit(e.target.value);setConversion(e.target.value==='ea'?'1':'');setPackageStatus('')}}>
        {purchaseUnits.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}
       </select>
      </div>
      <div><label className="form-label" htmlFor="units-per-package">Units per {purchaseUnit}</label>
       <input id="units-per-package" className="form-input" type="number" min={['ea','pack','container'].includes(stockUnit)?'1':'0.01'} step={['ea','pack','container'].includes(stockUnit)?'1':'0.01'} value={conversion} placeholder="Required" onChange={e=>setConversion(e.target.value)}/>
      </div>
     </div>
     <p className="text-xs text-gray-600">Stock tracking unit: <strong>{stockUnit}</strong> (set in the product catalogue).</p>
     <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
      <strong>Stock conversion</strong>
      <p>{validConversion?`Receiving 1 ${purchaseUnit} will add ${Number(conversion)} ${stockUnit} to stock.`:'Enter the quantity contained in one purchase unit to confirm the stock conversion.'}</p>
     </div>
     <p className="text-xs text-gray-600">Estimated technician usage: <strong>{selectedUsageGroup?'Enabled':'Not configured'}</strong>{selectedUsageGroup?` — ${selectedUsageGroup.name} (${[selectedUsageGroup.quick_1,selectedUsageGroup.quick_2,selectedUsageGroup.quick_3,selectedUsageGroup.quick_4].join(' / ')} ${selectedUsageGroup.unit})`:'. Set up usage groups under Admin → Consumables.'} This records stock deductions only; it does not create a ServiceM8 charge.</p>
     <button type="button" className="btn btn-primary" disabled={packageBusy||!productId||!supplierId||!packageLabel.trim()||!validConversion} onClick={savePackage}>{packageBusy?'Saving package…':editingPackage?'Save purchase option changes':'Add purchase option'}</button>
     {packageStatus&&<p role="status" className="text-xs mt-2">{packageStatus}</p>}
     {supplierOptions.length>0&&<ul className="text-xs text-gray-600 space-y-2 mt-2">{supplierOptions.map(x=><li key={x.id} className="flex items-center justify-between gap-2">
      <span>{suppliers.find(s=>s.id===x.supplier_id)?.name}: {x.package_label} = {x.units_per_package} {products.find(p=>p.id===productId)?.stock_unit||'ea'} per {x.purchase_unit} {x.active?'':'(retired)'}</span>
      <div className="flex flex-wrap gap-1">
       <button type="button" className="btn btn-sm" disabled={packageBusy} onClick={()=>{setEditingPackage(x.id);setSupplierId(x.supplier_id);setSupplierCode(x.supplier_code??'');setPackageLabel(x.package_label);setPurchaseUnit(x.purchase_unit);setConversion(String(x.units_per_package));setPackageStatus('')}}>Edit</button>
       <button type="button" className="btn btn-sm" disabled={packageBusy} onClick={()=>togglePackage(x)}>{x.active?'Retire':'Reactivate'}</button>
       <button type="button" className="btn btn-sm" disabled={packageBusy} onClick={()=>deleteRecord('package',x.id,x.package_label)}>Delete if unused</button>
      </div>
     </li>)}</ul>}
    </div>
    <div className="space-y-2">
     <h3 className="font-medium text-sm">Storage bin</h3>
     <p className="text-xs text-gray-500">For product selected in the middle panel.</p>
     <label className="form-label" htmlFor="bin-location">Physical stock location</label>
     <select id="bin-location" className="form-input" value={loc} onChange={e=>chooseLocation(e.target.value)}>
      {warehouses.map(w=><option key={w.id} value={'warehouse:'+w.id}>{w.name}</option>)}
      {vans.map(v=><option key={v.id} value={'van:'+v.id}>{v.van_number}</option>)}
     </select>
     <label className="form-label" htmlFor="bin-label">Bin, drawer or shelf</label>
     <input id="bin-label" className="form-input" value={bin} onChange={e=>setBin(e.target.value)} placeholder="e.g. BIN-03 or Drawer 2" maxLength={80}/>
     {currentBin&&<p className="text-xs text-gray-500">Saved bin: {currentBin.bin_label}</p>}
     <button className="btn btn-primary" type="button" disabled={binBusy||!productId||!loc||!bin.trim()} onClick={saveBin}>{binBusy?'Saving bin…':'Save bin location'}</button>
     {binStatus&&<p role="status" className="text-xs mt-2">{binStatus}</p>}
    </div>
   </div>
 </section>
}
