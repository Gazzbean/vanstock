'use client'
import {useState,useTransition,useEffect,useRef} from 'react'
import Link from 'next/link'
import {receiveSupplierPack,receiveLooseItem,getReceiveStockBalance,getRecentStockReceipts} from '@/lib/actions'

type Product={id:string;name:string;stock_unit:string|null;archived_at?:string|null}
type Supplier={id:string;name:string;active?:boolean}
type Pack={id:string;product_id:string;supplier_id:string;package_label:string;purchase_unit:string;units_per_package:number}
type Van={id:string;van_number:string}
type Warehouse={id:string;name:string}
type Receipt={id:string;kind:'pack'|'loose';product:string;unit:string;supplier:string;destination:string;quantity:number;docket:string;created_at:string;processed_by:string|null;processor_initials:string|null}
type Props={products:Product[];suppliers:Supplier[];packages:Pack[];vans:Van[];warehouses:Warehouse[];initialReceipts:Receipt[];selectedVanId?:string}

function labelPerson(name:string|null,initials:string|null){
 if(name)return initials?`${name} (${initials})`:name
 return initials??'Unknown user'
}
function isDuplicateDocketError(message:string){
 return /(?:pack_receipts|loose_receipts|loose_item_receipts).*docket_guard|duplicate key value.*(?:docket|receipt)|receipt reference already (?:used|recorded)/i.test(message)
}
export default function ReceiveStockWorkflow({products,suppliers,packages,vans,warehouses,initialReceipts,selectedVanId}:Props){
 const available=products.filter(p=>!p.archived_at)
 const [mode,setMode]=useState<'pack'|'loose'>('pack')
 const [productId,setProductId]=useState('')
 const [supplierId,setSupplierId]=useState('')
 const [packageId,setPackageId]=useState('')
 const [amount,setAmount]=useState('1')
 // Technicians receive directly into their selected Working Van by default.
 // Office users still choose a warehouse or van explicitly.
 const [destination,setDestination]=useState(selectedVanId?'van:'+selectedVanId:'')
 const [docket,setDocket]=useState('')
 const [confirm,setConfirm]=useState(false)
 const [receiptId,setReceiptId]=useState('')
 const [pending,start]=useTransition()
 const [error,setError]=useState('')
 const [duplicateReference,setDuplicateReference]=useState(false)
 const [success,setSuccess]=useState('')
 const [balance,setBalance]=useState<number|null>(null)
 const [balanceLoading,setBalanceLoading]=useState(false)
 const [receipts,setReceipts]=useState(initialReceipts)
 const [lastReceipt,setLastReceipt]=useState<{quantity:number;unit:string;destination:string;newBalance:number|null}|null>(null)
 const finalConfirmationRef=useRef<HTMLDivElement>(null)
 const reviewSectionRef=useRef<HTMLElement>(null)
 const docketInputRef=useRef<HTMLInputElement>(null)
 const [reviewHighlighted,setReviewHighlighted]=useState(false)

 const chosenProduct=available.find(p=>p.id===productId)
 const chosenSupplier=suppliers.find(s=>s.id===supplierId)
 const eligiblePackages=packages.filter(p=>p.product_id===productId&&p.supplier_id===supplierId)
 const selectedPack=eligiblePackages.find(p=>p.id===packageId)
 const unit=chosenProduct?.stock_unit||'ea'
 const qty=Number(amount)
 const stockQty=mode==='pack'?qty*Number(selectedPack?.units_per_package||0):qty
 const wholeUnit=['ea','pack','container','roll'].includes(unit)
 const valid=!!chosenProduct&&!!chosenSupplier&&!!destination&&!!docket.trim()&&docket.trim().length<=120&&
 !!amount.trim()&&Number.isFinite(qty)&&qty>0&&qty<1000000000&&
 Math.abs(qty*100-Math.round(qty*100))<0.0000001&&
 (mode==='loose'||Number.isInteger(qty))&&
 (mode==='loose'||!!selectedPack)&&stockQty>0&&stockQty<1000000000&&
 (!wholeUnit||Number.isInteger(stockQty))
 const locations=[
   ...warehouses.map(w=>({id:'warehouse:'+w.id,name:w.name})),
   ...vans.map(v=>({id:'van:'+v.id,name:v.van_number})),
 ]
 const place=locations.find(l=>l.id===destination)
 useEffect(()=>{
  let cancelled=false
  setBalance(null)
  if(!productId||!destination)return
  const [kind,id]=destination.split(':')
  setBalanceLoading(true)
  getReceiveStockBalance(productId,kind as 'van'|'warehouse',id)
   .then(value=>{if(!cancelled)setBalance(value)})
   .catch(()=>{if(!cancelled)setBalance(null)})
   .finally(()=>{if(!cancelled)setBalanceLoading(false)})
  return()=>{cancelled=true}
 },[productId,destination])
 useEffect(()=>{
  if(!confirm)return
  // After the balance check completes, bring the *new* final action into view.
  // Focus also announces the changed stage to keyboard/screen-reader users.
  const frame=requestAnimationFrame(()=>{
   finalConfirmationRef.current?.scrollIntoView({behavior:'smooth',block:'center'})
   finalConfirmationRef.current?.focus({preventScroll:true})
  })
  return()=>cancelAnimationFrame(frame)
 },[confirm])
 function changed(){setConfirm(false);setReviewHighlighted(false);setError('');setDuplicateReference(false);setSuccess('');setReceiptId('');setLastReceipt(null)}
 function continueToReview(){
  if(!valid||pending)return
  setReviewHighlighted(true)
  reviewSectionRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  reviewSectionRef.current?.focus({preventScroll:true})
 }
 function changeMode(next:'pack'|'loose'){setMode(next);setAmount('1');changed()}
 function changeProduct(id:string){setProductId(id);setPackageId('');changed()}
 function changeSupplier(id:string){setSupplierId(id);setPackageId('');changed()}
 function submit(){
   if(!valid){setError('Complete all required fields and check the quantity.');return}
   const [type,locationId]=destination.split(':')
   setError('');setSuccess('')
   if(!confirm){
     start(async()=>{
       try{
         const latest=await getReceiveStockBalance(productId,type as 'van'|'warehouse',locationId)
         setBalance(latest);setConfirm(true)
       }catch{setError('Could not verify current stock. Please retry before recording this receipt.')}
     })
     return
   }
   const id=receiptId||crypto.randomUUID()
   if(!receiptId)setReceiptId(id)
   start(async()=>{
     try{
       const r=mode==='pack'
         ?await receiveSupplierPack(id,packageId,qty,docket,type as 'warehouse'|'van',locationId)
         :await receiveLooseItem(id,productId,supplierId,qty,docket,type as 'warehouse'|'van',locationId)
       if(r.error){
        if(isDuplicateDocketError(r.error)){
         setDuplicateReference(true)
         setConfirm(false)
         setError(`Receipt not saved — this product and destination were already recorded against ${docket.trim()}. No stock was added. Check Transaction History or ask an administrator to review a genuine additional delivery.`)
         requestAnimationFrame(()=>{
          docketInputRef.current?.scrollIntoView({behavior:'smooth',block:'center'})
          docketInputRef.current?.focus({preventScroll:true})
         })
        }else setError(r.error)
        return
       }
       let newBalance:number|null=null
       try{newBalance=await getReceiveStockBalance(productId,type as 'van'|'warehouse',locationId);setBalance(newBalance)}
       catch{setBalance(null)}
       setLastReceipt({quantity:Number(r.quantity),unit,destination:place?.name??'',newBalance})
       setSuccess('Receipt recorded successfully.')
       setConfirm(false);setDocket('');setReceiptId('');setAmount('1')
        try{setReceipts(await getRecentStockReceipts(selectedVanId))}catch{/* Receipt saved; history refresh can be retried by reloading. */}
     }catch{
       setError('Receipt status could not be confirmed. Do not change the details. Retry the confirmation using the same reference.')
     }
   })
 }
 return <div className="space-y-4 max-w-5xl">
  <section className="card border-2 border-green-500">
   <div className="mb-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <h2 className="font-semibold text-base text-gray-900">A. How are you receiving stock?</h2>
     <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">✓ Selected</span>
    </div>
    <p className="text-sm text-gray-500 mt-1">Choose one method. You will only see the fields required for that transaction.</p>
   </div>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <button type="button" aria-pressed={mode==='pack'} onClick={()=>changeMode('pack')}
     className={'rounded-lg border-2 p-4 text-left '+(mode==='pack'?'border-green-600 bg-green-50':'border-gray-200 bg-white hover:bg-gray-50')}>
     <div className="font-semibold text-sm">📦 Full packs, boxes or cartons</div>
     <p className="text-xs text-gray-600 mt-1">Example: 1 pack of 500 cable ties adds 500 ea to stock.</p>
    </button>
    <button type="button" aria-pressed={mode==='loose'} onClick={()=>changeMode('loose')}
     className={'rounded-lg border-2 p-4 text-left '+(mode==='loose'?'border-green-600 bg-green-50':'border-gray-200 bg-white hover:bg-gray-50')}>
     <div className="font-semibold text-sm">🔩 Individual or loose items</div>
     <p className="text-xs text-gray-600 mt-1">Example: 10 loose cable ties adds 10 ea to stock.</p>
    </button>
   </div>
  </section>
  <section className={'card space-y-4 border-2 '+(duplicateReference?'border-red-500':valid?'border-green-500':'border-gray-200')}>
   <div>
    <div className="flex flex-wrap items-center justify-between gap-2">
     <h2 className="font-semibold text-base text-gray-900">B. Receipt details</h2>
     {duplicateReference?<span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">Possible duplicate</span>:valid&&<span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">✓ Complete</span>}
    </div>
    <p className="text-xs text-gray-500 mt-1">Choose the product first, then the supplier. Package options will be filtered automatically.</p>
   </div>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
     <label htmlFor="r-product" className="form-label">Product <span className="text-red-600">*</span></label>
     <select id="r-product" className="form-input" value={productId} onChange={e=>changeProduct(e.target.value)}>
      <option value="">Select product…</option>
      {available.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </div>
    <div>
     <label htmlFor="r-supplier" className="form-label">Supplier <span className="text-red-600">*</span></label>
     <select id="r-supplier" className="form-input" value={supplierId} onChange={e=>changeSupplier(e.target.value)}>
      <option value="">Select supplier…</option>
      {suppliers.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </div>
   </div>
   {mode==='pack'&&<div>
    <label htmlFor="r-package" className="form-label">Purchased package <span className="text-red-600">*</span></label>
    <select id="r-package" className="form-input" value={packageId} onChange={e=>{setPackageId(e.target.value);changed()}} disabled={!productId||!supplierId}>
     <option value="">Select the supplier package…</option>
     {eligiblePackages.map(p=><option key={p.id} value={p.id}>{p.package_label} – {p.units_per_package} {unit} per {p.purchase_unit}</option>)}
    </select>
    {productId&&supplierId&&eligiblePackages.length===0&&
      <p className="text-sm text-amber-700 mt-2">There is no package for this supplier and product. <Link className="text-blue-700 underline" href="/admin">Add a package under Administration → Suppliers & bins</Link>, or choose loose items above.</p>}
   </div>}
   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
     <label htmlFor="r-qty" className="form-label">{mode==='pack'?'Number of packs received':'Quantity received ('+unit+')'} <span className="text-red-600">*</span></label>
     <input id="r-qty" type="number" min={mode==='pack'||wholeUnit?'1':'0.01'} step={mode==='pack'||wholeUnit?'1':'0.01'} className="form-input" value={amount} onChange={e=>{setAmount(e.target.value);changed()}}/>
    </div>
    <div>
     <label htmlFor="r-destination" className="form-label">Receive into <span className="text-red-600">*</span></label>
     <select id="r-destination" className="form-input" value={destination} onChange={e=>{setDestination(e.target.value);changed()}}>
      <option value="">Choose warehouse or van…</option>
      <optgroup label="Warehouse">{locations.filter(l=>l.id.startsWith('warehouse:')).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
      <optgroup label="Service vans">{locations.filter(l=>l.id.startsWith('van:')).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
     </select>
    </div>
   </div>
   <div>
    <label htmlFor="r-docket" className="form-label">Supplier delivery docket / invoice number <span className="text-red-600">*</span></label>
    <input ref={docketInputRef} id="r-docket" type="text" className={'form-input '+(duplicateReference?'border-2 border-red-600 bg-red-50':'')} aria-invalid={duplicateReference} aria-describedby={duplicateReference?'r-docket-error':undefined} maxLength={120} placeholder="e.g. DN-12345 or TEST-RECEIPT-003" value={docket} onChange={e=>{setDocket(e.target.value);changed()}}/>
    <p className="text-xs text-gray-500 mt-1">Enter the reference on the supplier's paperwork. One docket may cover several products or destinations; repeating the same product into the same location requires review.</p>
    {duplicateReference&&<div id="r-docket-error" role="alert" className="mt-3 rounded-lg border-2 border-red-500 bg-red-50 p-4 text-sm text-red-900">
     <p className="font-bold">❌ Receipt not saved — possible duplicate stock entry</p>
     <p className="mt-1">This product and destination have already been recorded against <strong>{docket.trim()}</strong>. <strong>No stock was added.</strong></p>
     <p className="mt-1">Check the earlier receipt in Transaction History. If this is another delivery of the same item under the same docket, ask an administrator to review it before recording additional stock.</p>
    </div>}
   </div>
   {valid&&!confirm&&!success&&!duplicateReference&&<div className="rounded-lg border border-green-300 bg-green-50 p-4 space-y-2" role="status">
    <p className="text-sm font-semibold text-green-900">✓ Receipt details complete</p>
    <p className="text-sm text-green-800">All required information has been entered. Continue to <strong>C. Review and confirm</strong> to check the quantities before recording the receipt.</p>
    <button type="button" className="btn btn-primary" disabled={pending} onClick={continueToReview}>Continue to Review ↓</button>
    <p className="text-xs text-green-800">This button only moves you to the review. No stock will be saved.</p>
   </div>}
  </section>
  <section ref={reviewSectionRef} tabIndex={-1} aria-label="Review and confirm receipt" className={'card space-y-3 scroll-mt-4 focus:outline-none border-2 '+(success?'border-green-500':confirm?'border-green-500':valid?'border-amber-500':'border-gray-200')+(reviewHighlighted&&!confirm?' ring-2 ring-amber-300':'')}>
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h2 className="font-semibold text-base text-gray-900">C. Review and confirm</h2>
    {success?<span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">✓ Receipt saved</span>:
     valid?<span className={'rounded-full px-3 py-1 text-xs font-semibold '+(confirm?'bg-green-100 text-green-800':'bg-amber-100 text-amber-900')}>
      {confirm?'Stage 2 — Ready to save':'Stage 1 — Review (not saved)'}
     </span>:<span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">Awaiting receipt details</span>}
   </div>
   <div className="rounded-lg bg-gray-50 p-4 border border-gray-200">
    <p className="text-xs text-gray-500">Stock quantity to add</p>
    <div className="text-2xl font-semibold text-gray-900 mt-1">{valid?stockQty.toLocaleString('en-AU'):'—'} <span className="text-base font-normal">{unit}</span></div>
    <p className="text-sm text-gray-600 mt-1">{chosenProduct?.name||'Select a product'} → {place?.name||'Select a destination'}</p>
    {mode==='pack'&&selectedPack&&<p className="text-xs text-gray-500 mt-1">{qty} packs × {selectedPack.units_per_package} {unit} per pack</p>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 border-t border-gray-200 pt-3">
     <div><p className="text-xs text-gray-500">Current balance</p><p className="text-base font-medium">{balanceLoading?'Checking…':balance!==null?balance.toLocaleString('en-AU')+' '+unit:'Select product and destination'}</p></div>
     <div><p className="text-xs text-gray-500">Quantity received</p><p className="text-base font-medium">{valid?stockQty.toLocaleString('en-AU')+' '+unit:'—'}</p></div>
     <div><p className="text-xs text-gray-500">Expected balance</p><p className="text-base font-semibold">{valid&&balance!==null?(balance+stockQty).toLocaleString('en-AU')+' '+unit:'—'}</p></div>
    </div>
    <p className="text-xs text-gray-500 mt-2">Current balance is a snapshot. The final posted balance is re-read after saving.</p>
   </div>
   <p className="text-xs text-amber-700">Testing only: use synthetic products and references. Cylinders require a separate serial-number receiving process. No ServiceM8 billing is performed.</p>
   {confirm&&valid?<div ref={finalConfirmationRef} tabIndex={-1} role="group" aria-label="Step 2 of 2, final confirmation required" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 space-y-3 focus:outline-none focus:ring-2 focus:ring-amber-500">
     <div className="flex gap-2 items-start">
      <span aria-hidden="true" className="text-xl">⚠️</span>
      <div>
       <h3 className="text-base font-bold text-amber-950">Stage 2 — Ready to save; receipt not yet recorded</h3>
       <p className="text-sm text-amber-900 mt-1">Your receipt has been reviewed, but stock has <strong>not</strong> been updated. One final confirmation is required.</p>
      </div>
     </div>
     <p className="text-sm font-semibold text-gray-900">Receive {stockQty.toLocaleString('en-AU')} {unit} of {chosenProduct?.name} into {place?.name}?</p>
     <div className="flex gap-3 flex-wrap items-center">
      <button type="button" className="btn bg-green-700 hover:bg-green-800 text-white border-green-700 focus-visible:ring-2 focus-visible:ring-green-600" disabled={!valid||pending||balanceLoading} onClick={submit}>
       {pending?'Saving receipt…':'Confirm & save receipt'}
      </button>
      <button type="button" className="btn" disabled={pending} onClick={()=>setConfirm(false)}>Back to edit</button>
     </div>
   </div>:<div className="space-y-2">
    <p className="text-sm font-medium text-blue-800">Reviewing only checks your receipt. No stock will be added until you confirm and save it.</p>
    <button type="button" className="btn btn-primary" disabled={!valid||pending||balanceLoading} onClick={submit}>{pending?'Checking balance…':'Review receipt — No stock changes yet'}</button>
   </div>}
   {error&&!duplicateReference&&<p className="text-sm text-red-700" role="alert">{error}</p>}
   {success&&<div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status"><p className="font-semibold">{success}</p>{lastReceipt&&<p className="mt-1">Added {lastReceipt.quantity.toLocaleString('en-AU')} {lastReceipt.unit} to {lastReceipt.destination}. {lastReceipt.newBalance!==null?'New balance: '+lastReceipt.newBalance.toLocaleString('en-AU')+' '+lastReceipt.unit+'.':'Refresh the page to check the updated balance.'}</p>}</div>}
  </section>
  <section className="card mt-4">
   <div className="flex items-center justify-between gap-3 mb-3"><h2 className="font-semibold text-base text-gray-900">Recent receipts</h2><span className="text-xs text-gray-500">Latest 10, packs and loose items</span></div>
   {receipts.length===0?<p className="text-sm text-gray-500">No receipts recorded yet.</p>:<div className="overflow-x-auto"><table className="w-full"><thead><tr>{['Date (Perth)','Product','Supplier','Type','Quantity','Destination','Processed by','Reference'].map(h=><th key={h} className="table-header">{h}</th>)}</tr></thead><tbody>{receipts.map(r=><tr key={r.kind+':'+r.id}><td className="table-cell whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td className="table-cell">{r.product}</td><td className="table-cell">{r.supplier}</td><td className="table-cell">{r.kind==='pack'?'Pack':'Loose'}</td><td className="table-cell whitespace-nowrap">{r.quantity.toLocaleString('en-AU')} {r.unit}</td><td className="table-cell">{r.destination}</td><td className="table-cell whitespace-nowrap">{labelPerson(r.processed_by,r.processor_initials)}</td><td className="table-cell">{r.docket}</td></tr>)}</tbody></table></div>}
  </section>
 </div>
}
