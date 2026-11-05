'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitStockCorrection } from '@/lib/stock-adjustment-actions'

type Option = { id: string; name: string }
type Product = { id: string; name: string; stock_unit: string | null }
type Balance = { location: string; productId: string; quantity: number }

export default function StockCorrectionForm({ vans, warehouses, products, balances }: {
  vans: { id: string; van_number: string }[]
  warehouses: Option[]
  products: Product[]
  balances: Balance[]
}) {
  const router = useRouter()
  const [location, setLocation] = useState('')
  const [productId, setProductId] = useState('')
  const [operation, setOperation] = useState<'add'|'remove'|'set'>('set')
  const [quantity, setQuantity] = useState('0')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()

  const product = products.find(p => p.id === productId)
  const matched = balances.find(b => b.location === location && b.productId === productId)
  const current = matched?.quantity ?? 0
  const amount = Number(quantity)
  const quantityPattern = ['kg','m'].includes(product?.stock_unit ?? '') ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/
  const validQuantity = quantityPattern.test(quantity) && Number.isFinite(amount) && amount >= 0 && amount < 1000000000 && (operation === 'set' || amount > 0)
  const next = operation === 'set' ? amount : operation === 'add' ? current + amount : current - amount
  const warehouseWithoutBalance = location.startsWith('warehouse:') && !matched
  const valid = !!location && !!productId && validQuantity && next >= 0 && next < 1000000000 && next !== current && !!reference.trim() && !warehouseWithoutBalance

  function submit() {
    setError(''); setSuccess('')
    if (!valid) return setError('Check the location, quantity and mandatory reason before continuing.')
    if (!window.confirm(`Confirm audited stock adjustment?\n\n${product?.name}\n${location.startsWith('van:') ? vans.find(v=>`van:${v.id}`===location)?.van_number : warehouses.find(w=>`warehouse:${w.id}`===location)?.name}\nPrevious: ${current} ${product?.stock_unit ?? 'ea'}\nNew: ${next} ${product?.stock_unit ?? 'ea'}\nReason: ${reference}`)) return
    startTransition(async () => {
      try {
        const result = await submitStockCorrection({ location, productId, operation, quantity: amount, reference })
        if (result.error) return setError(result.error)
        setSuccess('Adjustment recorded. The page is refreshing with the latest balances.')
        setProductId(''); setReference(''); setQuantity('0')
        router.refresh()
      } catch {
        setError('Could not confirm the adjustment. Check Transaction History and the live balance before retrying.')
      }
    })
  }

  return <section className="card">
    <h2 className="text-sm font-semibold mb-2">Audited stock adjustment</h2>
    <p className="text-xs text-gray-600 mb-4">For administrator corrections only. This does not transfer stock between locations. The reason and before/after balances are retained in Transaction History.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><label className="form-label" htmlFor="adjust-location">Location *</label>
        <select id="adjust-location" className="form-input" value={location} onChange={e=>{setLocation(e.target.value);setError('');setSuccess('')}}>
          <option value="">Select van or warehouse</option>
          <optgroup label="Vans">{vans.map(v=><option key={v.id} value={`van:${v.id}`}>{v.van_number}</option>)}</optgroup>
          <optgroup label="Warehouses">{warehouses.map(w=><option key={w.id} value={`warehouse:${w.id}`}>{w.name}</option>)}</optgroup>
        </select></div>
      <div><label className="form-label" htmlFor="adjust-product">Product *</label>
        <select id="adjust-product" className="form-input" value={productId} onChange={e=>{setProductId(e.target.value);setError('');setSuccess('')}}>
          <option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select></div>
      <div><label className="form-label" htmlFor="adjust-operation">Adjustment *</label>
        <select id="adjust-operation" className="form-input" value={operation} onChange={e=>setOperation(e.target.value as 'add'|'remove'|'set')}>
          <option value="set">Set balance</option><option value="add">Add stock</option><option value="remove">Remove stock</option>
        </select></div>
      <div><label className="form-label" htmlFor="adjust-quantity">{operation==='set'?'New balance':'Quantity'} ({product?.stock_unit??'ea'}) *</label>
        <input id="adjust-quantity" className="form-input" type="number" min="0" step={['kg','m'].includes(product?.stock_unit??'')?'0.01':'1'} value={quantity} onChange={e=>setQuantity(e.target.value)}/></div>
      <div className="md:col-span-2"><label className="form-label" htmlFor="adjust-reason">Reason / reference *</label>
        <input id="adjust-reason" className="form-input" maxLength={500} value={reference} onChange={e=>setReference(e.target.value)} placeholder="e.g. TEST-RESET-014-V4 — clear legacy test balance"/></div>
    </div>
    {location && product && <div className="rounded-lg border bg-blue-50 p-4 mt-4 text-sm">
      <div className="flex flex-wrap gap-8"><span>Current balance: <strong>{current} {product.stock_unit??'ea'}</strong></span>
        <span>Proposed balance: <strong>{validQuantity ? `${next} ${product.stock_unit??'ea'}` : '—'}</strong></span></div>
      {warehouseWithoutBalance&&<p className="text-amber-700 mt-2">This warehouse product has no opening balance. Complete an authorised opening stocktake first.</p>}
      {validQuantity&&next<0&&<p className="text-red-700 mt-2">This would create negative stock and is not permitted.</p>}
    </div>}
    {error&&<p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
    {success&&<p role="status" className="text-sm text-green-700 mt-3">{success}</p>}
    <button type="button" className="btn btn-primary mt-4" disabled={!valid||pending} onClick={submit}>{pending?'Saving…':'Review and confirm adjustment'}</button>
  </section>
}
