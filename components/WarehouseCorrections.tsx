'use client'

import { useState, useTransition } from 'react'
import { adjustWarehouseStock, returnVanStockToWarehouse } from '@/lib/actions'

type Warehouse = { id: string; name: string }
type Van = { id: string; van_number: string }
type Product = { id: string; name: string; unit: string }
type Balance = { warehouse_id: string; product_id: string; quantity: number }

export default function WarehouseCorrections({
  warehouses, vans, products, balances, enabled,
}: {
  warehouses: Warehouse[]
  vans: Van[]
  products: Product[]
  balances: Balance[]
  enabled: boolean
}) {
  const [mode, setMode] = useState<'return'|'adjust'>('return')
  const [warehouseId, setWarehouseId] = useState('')
  const [vanId, setVanId] = useState('')
  const [productId, setProductId] = useState('')
  const [operation, setOperation] = useState<'add'|'remove'|'set'>('add')
  const [qty, setQty] = useState('1')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()
  const product = products.find(p => p.id === productId)
  const current = balances.find(b => b.warehouse_id === warehouseId && b.product_id === productId)
  const decimal = product?.unit === 'kg' || product?.unit === 'm'
  const validPrecision = decimal ? /^\d+(?:\.\d{1,2})?$/.test(qty) : /^\d+$/.test(qty)
  const amount = Number(qty)
  const valid = enabled && !!warehouseId && !!productId && validPrecision &&
    Number.isFinite(amount) && amount >= 0 && !!reference.trim() &&
    (mode === 'return'
      ? !!vanId && amount > 0
      : !!current && (operation === 'set' || amount > 0) &&
        (operation !== 'remove' || amount <= current.quantity) &&
        (operation !== 'set' || amount !== current.quantity))
  const availableProducts = mode === 'adjust'
    ? products.filter(p => balances.some(b => b.warehouse_id === warehouseId && b.product_id === p.id))
    : products

  function changeMode(next: 'return'|'adjust') {
    setMode(next); setProductId(''); setQty('1'); setError(''); setSuccess('')
  }

  function submit() {
    setError(''); setSuccess('')
    if (!valid) { setError('Complete the stock movement and provide a reference.'); return }
    startTransition(async () => {
      try {
        const result = mode === 'return'
          ? await returnVanStockToWarehouse(warehouseId, vanId, productId, amount, reference.trim())
          : await adjustWarehouseStock(warehouseId, productId, operation, amount, reference.trim())
        if (result.error) setError(result.error)
        else {
          setSuccess('Recorded successfully. Refresh the page before entering another movement.')
          setReference('')
          setProductId('')
        }
      } catch {
        setError('Could not confirm this movement. Check current balances before trying again.')
      }
    })
  }

  return (
    <section className="card mt-4">
      <h2 className="text-sm font-medium mb-2">Warehouse returns &amp; adjustments</h2>
      <p className="text-xs text-gray-500 mb-4">
        Returns transfer stock from a van to the warehouse. Adjustments correct an existing warehouse balance with a required audit reason.
      </p>
      <div className="flex gap-4 mb-4">
        <label className="text-sm"><input type="radio" checked={mode === 'return'} onChange={() => changeMode('return')} /> Van → Warehouse return</label>
        <label className="text-sm"><input type="radio" checked={mode === 'adjust'} onChange={() => changeMode('adjust')} /> Warehouse adjustment</label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="form-label" htmlFor="correction-wh">Warehouse</label>
          <select id="correction-wh" className="form-input" value={warehouseId}
            onChange={e => { setWarehouseId(e.target.value); setProductId(''); setSuccess('') }}>
            <option value="">Select warehouse</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        {mode === 'return' ? (
          <div>
            <label className="form-label" htmlFor="return-van">Source van</label>
            <select id="return-van" className="form-input" value={vanId}
              onChange={e => setVanId(e.target.value)}>
              <option value="">Select van</option>
              {vans.map(v => <option key={v.id} value={v.id}>{v.van_number}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="form-label" htmlFor="adjust-op">Adjustment</label>
            <select id="adjust-op" className="form-input" value={operation}
              onChange={e => setOperation(e.target.value as 'add'|'remove'|'set')}>
              <option value="add">Add to recorded stock</option>
              <option value="remove">Remove from recorded stock</option>
              <option value="set">Set verified physical count</option>
            </select>
          </div>
        )}
        <div>
          <label className="form-label" htmlFor="correction-product">Product</label>
          <select id="correction-product" className="form-input" value={productId}
            onChange={e => setProductId(e.target.value)}>
            <option value="">Select product</option>
            {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
          {mode === 'adjust' && current && (
            <p className="text-xs text-gray-500 mt-1">Current warehouse balance: {current.quantity} {product?.unit}</p>
          )}
        </div>
        <div>
          <label className="form-label" htmlFor="correction-qty">
            {mode === 'adjust' && operation === 'set' ? 'Verified count' : 'Quantity'} {product ? '(' + product.unit + ')' : ''}
          </label>
          <input id="correction-qty" className="form-input" type="number"
            min={mode === 'adjust' && operation === 'set' ? '0' : decimal ? '0.01' : '1'}
            step={decimal ? '0.01' : '1'} value={qty} onChange={e => setQty(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label" htmlFor="correction-ref">Reason / reference (required)</label>
          <input id="correction-ref" className="form-input" maxLength={500}
            value={reference} onChange={e => setReference(e.target.value)}
            placeholder={mode === 'return' ? 'Return or transfer reference' : 'Stocktake or adjustment reason'} />
        </div>
      </div>
      {mode === 'adjust' && warehouseId && availableProducts.length === 0 && (
        <p className="text-xs text-amber-700 mt-3">No opening balances exist in this warehouse. Use Opening warehouse stocktake first.</p>
      )}
      {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
      {success && <p role="status" className="text-sm text-green-700 mt-3">{success}</p>}
      <button className="btn btn-primary mt-4" type="button"
        disabled={!valid || pending} onClick={submit}>
        {pending ? 'Recording…' : mode === 'return' ? 'Confirm warehouse return' : 'Record adjustment'}
      </button>
    </section>
  )
}
