'use client'

import { useState, useTransition } from 'react'
import { postWarehouseOpeningStock } from '@/lib/actions'

type WarehouseOption = { id: string; name: string }
type ProductOption = { id: string; name: string; unit: string }
type Balance = { warehouse_id: string; product_id: string; quantity: number }

export default function WarehouseOpeningStockForm({
  warehouses, products, balances, enabled,
}: {
  warehouses: WarehouseOption[]
  products: ProductOption[]
  balances: Balance[]
  enabled: boolean
}) {
  const [warehouseId, setWarehouseId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('0')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()

  const product = products.find(p => p.id === productId)
  const isDecimal = product?.unit === 'kg' || product?.unit === 'm'
  const hasBalance = balances.some(b => b.warehouse_id === warehouseId && b.product_id === productId)
  const precise = isDecimal ? /^\d+(?:\.\d{1,2})?$/.test(quantity) : /^\d+$/.test(quantity)
  const amount = Number(quantity)
  const valid = !!warehouseId && !!productId && !hasBalance && precise &&
    Number.isFinite(amount) && amount >= 0 && !!reference.trim()

  function submit() {
    setError('')
    setSuccess('')
    if (!valid) {
      setError('Select a product without an existing balance, then enter a valid count and stocktake reference.')
      return
    }
    if (!enabled) return
    startTransition(async () => {
      try {
        const result = await postWarehouseOpeningStock(warehouseId, productId, amount, reference.trim())
        if (result.error) setError(result.error)
        else {
          setSuccess('Opening balance posted. Refresh the page to see the updated stock.')
          setProductId('')
          setQuantity('0')
        }
      } catch {
        setError('Unable to post opening stock. No confirmation was received.')
      }
    })
  }

  return (
    <section className="card mt-4">
      <h2 className="text-sm font-medium mb-2">Opening warehouse stocktake</h2>
      <p className="text-xs text-gray-500 mb-4">
        Record the approved physical count once per product. This section is disabled until
        database validation and commissioning are complete.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="opening-warehouse" className="form-label">Warehouse</label>
          <select id="opening-warehouse" className="form-input" value={warehouseId}
            onChange={e => { setWarehouseId(e.target.value); setProductId('') }}>
            <option value="">Select warehouse</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="opening-product" className="form-label">Product</label>
          <select id="opening-product" className="form-input" value={productId}
            onChange={e => setProductId(e.target.value)}>
            <option value="">Select product</option>
            {products.map(p => (
              <option key={p.id} value={p.id}
                disabled={balances.some(b => b.warehouse_id === warehouseId && b.product_id === p.id)}>
                {p.name} ({p.unit})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="opening-count" className="form-label">
            Count {product ? '(' + product.unit + ')' : ''}
          </label>
          <input id="opening-count" className="form-input" type="number" min="0"
            step={isDecimal ? '0.01' : '1'} value={quantity}
            onChange={e => setQuantity(e.target.value)} />
        </div>
        <div>
          <label htmlFor="opening-reference" className="form-label">Approved stocktake reference</label>
          <input id="opening-reference" className="form-input" value={reference}
            onChange={e => setReference(e.target.value)} placeholder="e.g. Opening count 2026-11" />
        </div>
      </div>
      {hasBalance && <p className="text-sm text-amber-700 mt-3">A balance already exists for this product; opening stock cannot overwrite it.</p>}
      {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
      {success && <p role="status" className="text-sm text-green-700 mt-3">{success}</p>}
      <button type="button" className="btn btn-primary mt-4"
        disabled={!enabled || pending || !valid} onClick={submit}>
        {pending ? 'Posting…' : enabled ? 'Post opening stock' : 'Opening stock posting — not yet enabled'}
      </button>
    </section>
  )
}
