'use client'
import {useState,useTransition} from 'react'
import {addCatalogueSupplier,addSupplierPackage,saveProductBin} from '@/lib/actions'

type Product={id:string;name:string;stock_unit:string|null}
type Supplier={id:string;name:string;account_number:string|null;active:boolean}
type Option={id:string;product_id:string;supplier_id:string;supplier_code:string|null;package_label:string;purchase_unit:string;units_per_package:number;preferred:boolean}
type Bin={id:string;product_id:string;van_id:string|null;warehouse_id:string|null;bin_label:string}
type Location={id:string;name:string}
export default function SupplierAndBinsPanel({products,suppliers,options,bins,vans,warehouses}:{
 products:Product[];suppliers:Supplier[];options:Option[];bins:Bin[];
 vans:{id:string;van_number:string}[];warehouses:Location[]
}){
 const [name,setName]=useState('')
 const [account,setAccount]=useState('')
 const [supplierId,setSupplierId]=useState(suppliers[0]?.id??'')
 const [productId,setProductId]=useState(products[0]?.id??'')
 const [supplierCode,setSupplierCode]=useState('')
 const [packageLabel,setPackageLabel]=useState('')
 const [purchaseUnit,setPurchaseUnit]=useState('pack')
 const [conversion,setConversion]=useState('1')
 const [loc,setLoc]=useState(warehouses[0]?'warehouse:'+warehouses[0].id:vans[0]?'van:'+vans[0].id:'')
 const [bin,setBin]=useState('')
 const [supplierStatus,setSupplierStatus]=useState('')
 const [packageStatus,setPackageStatus]=useState('')
 const [binStatus,setBinStatus]=useState('')
 const [supplierBusy,startSupplier]=useTransition()
 const [packageBusy,startPackage]=useTransition()
 const [binBusy,startBin]=useTransition()
 const supplierOptions=options.filter(x=>x.product_id===productId)
 const chosenLocation=loc.split(':')
 const currentBin=bins.find(x=>x.product_id===productId && (chosenLocation[0]==='van'?x.van_id===chosenLocation[1]:x.warehouse_id===chosenLocation[1]))
 function chooseLocation(v:string,pid=productId){setLoc(v);const [kind,id]=v.split(':');setBin(bins.find(b=>b.product_id===pid&&(kind==='van'?b.van_id===id:b.warehouse_id===id))?.bin_label??'');setBinStatus('')}
 function chooseProduct(id:string){setProductId(id);chooseLocation(loc,id);setPackageStatus('')}
 function saveSupplier(){
  setSupplierStatus('')
  startSupplier(async()=>{try{const r=await addCatalogueSupplier(name,account);setSupplierStatus(r.error||'Supplier saved. Refresh to select it.');if(!r.error){setName('');setAccount('')}}catch{setSupplierStatus('Could not confirm supplier. Refresh before retrying.')}})
 }
 function savePackage(){
  setPackageStatus('')
  startPackage(async()=>{try{const r=await addSupplierPackage(productId,supplierId,supplierCode,packageLabel,purchaseUnit,Number(conversion));setPackageStatus(r.error||'Purchase option saved. No stock was received.');if(!r.error){setPackageLabel('');setSupplierCode('')}}catch{setPackageStatus('Could not confirm package. Refresh before retrying.')}})
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
     <h3 className="font-medium text-sm">Add supplier</h3>
     <label className="form-label" htmlFor="new-supplier">Supplier name</label>
     <input id="new-supplier" className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Sample supplier" maxLength={120}/>
     <label className="form-label" htmlFor="supplier-account">Account reference (optional)</label>
     <input id="supplier-account" className="form-input" value={account} onChange={e=>setAccount(e.target.value)} maxLength={100}/>
     <button type="button" className="btn btn-primary" disabled={supplierBusy||!name.trim()} onClick={saveSupplier}>{supplierBusy?'Saving supplier…':'Add supplier'}</button>
     {supplierStatus&&<p role="status" className="text-xs mt-2">{supplierStatus}</p>}
     <p className="text-xs text-gray-500">Suppliers: {suppliers.length}. Use synthetic names until actual supplier configuration is approved.</p>
    </div>
    <div className="space-y-2">
     <h3 className="font-medium text-sm">Purchase package</h3>
     <label className="form-label" htmlFor="package-product">Product</label>
     <select id="package-product" className="form-input" value={productId} onChange={e=>chooseProduct(e.target.value)}>
      {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
     <label className="form-label" htmlFor="package-supplier">Supplier</label>
     <select id="package-supplier" className="form-input" value={supplierId} onChange={e=>setSupplierId(e.target.value)}>
      {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
     <label className="form-label" htmlFor="package-label">Package description</label>
     <input id="package-label" className="form-input" value={packageLabel} onChange={e=>setPackageLabel(e.target.value)} placeholder="e.g. Small cylinder 12 kg" maxLength={100}/>
     <label className="form-label" htmlFor="package-code">Supplier part number (optional)</label>
     <input id="package-code" className="form-input" value={supplierCode} onChange={e=>setSupplierCode(e.target.value)} maxLength={120}/>
     <div className="grid grid-cols-2 gap-2">
      <div><label className="form-label" htmlFor="purchase-unit">Purchase unit</label>
       <select id="purchase-unit" className="form-input" value={purchaseUnit} onChange={e=>setPurchaseUnit(e.target.value)}>
        {['ea','pack','box','roll','container','cylinder','kg','m'].map(u=><option key={u} value={u}>{u}</option>)}
       </select>
      </div>
      <div><label className="form-label" htmlFor="units-per-package">Stock units per pack</label>
       <input id="units-per-package" className="form-input" type="number" min="0.01" step="0.01" value={conversion} onChange={e=>setConversion(e.target.value)}/>
      </div>
     </div>
     <p className="text-xs text-gray-500">Conversion is in {products.find(p=>p.id===productId)?.stock_unit||'ea'} per purchase unit.</p>
     <button type="button" className="btn btn-primary" disabled={packageBusy||!productId||!supplierId||!packageLabel.trim()} onClick={savePackage}>{packageBusy?'Saving package…':'Add purchase option'}</button>
     {packageStatus&&<p role="status" className="text-xs mt-2">{packageStatus}</p>}
     {supplierOptions.length>0&&<ul className="text-xs text-gray-600 space-y-1 mt-2">{supplierOptions.map(x=><li key={x.id}>{suppliers.find(s=>s.id===x.supplier_id)?.name}: {x.package_label} = {x.units_per_package} {products.find(p=>p.id===productId)?.stock_unit||'ea'}</li>)}</ul>}
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
