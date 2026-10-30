'use client'

import { useState } from 'react'

// Planning screen only: no database writes and no Server Actions.
type VanOption = { id: string; van_number: string }
type ProductOption = { id: string; name: string; unit: string }
type WarehouseOption = { id: string; name: string }
type WarehouseBalance = { warehouse_id: string; product_id: string; quantity: number }

export default function WarehouseReplenishmentDraft({
  vans, products, warehouses, balances, enabled,
}: {
  vans: VanOption[]
  products: ProductOption[]
  warehouses: WarehouseOption[]
  balances: WarehouseBalance[]
  enabled: boolean
}) {
  const [warehouseId, setWarehouseId] = useState('')
  const [vanId, setVanId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reference, setReference] = useState('')

  const warehouse = warehouses.find(w => w.id === warehouseId)
  const van = vans.find(v => v.id === vanId)
  const product = products.find(p => p.id === productId)
  const available = balances.find(b => b.warehouse_id === warehouseId && b.product_id === productId)?.quantity ?? 0
  const requested = Number(quantity)
  // This is a read-only planning preview. It does NOT authorize fractional database writes.
  const supportsDecimals = product?.unit === 'kg' || product?.unit === 'm'
  const step = supportsDecimals ? '0.001' : '1'
  const precisionValid = supportsDecimals
    ? /^\d+(?:\.\d{1,3})?$/.test(quantity)
    : /^\d+$/.test(quantity)
  const valid = Boolean(enabled && warehouse && van && product && precisionValid &&
    requested > 0 && requested <= available && Number.isFinite(requested))

  return (
    <section className="card mt-4">
      <h2 className="text-sm font-medium mb-2">Warehouse → Van replenishment (planning preview)</h2>
      <p className="text-xs text-gray-500 mb-4">
        Review the proposed stock movement. Confirmation is disabled until the warehouse database,
        opening balances and transactional controls have been commissioned.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="form-label" htmlFor="warehouse-origin">Source warehouse</label>
          <select id="warehouse-origin" className="form-input" value={warehouseId}
            onChange={e => { setWarehouseId(e.target.value); setProductId('') }}>
            <option value="">Select warehouse</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="warehouse-destination">Receiving van</label>
          <select id="warehouse-destination" className="form-input" value={vanId}
            onChange={e => setVanId(e.target.value)}>
            <option value="">Select van</option>
            {vans.map(v => <option key={v.id} value={v.id}>{v.van_number}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="warehouse-product">Product</label>
          <select id="warehouse-product" className="form-input" value={productId}
            onChange={e => setProductId(e.target.value)}>
            <option value="">Select product</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {productId && <p className="text-xs text-gray-500 mt-1">Recorded warehouse balance: {available} {product?.unit ?? 'ea'}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="warehouse-quantity">Quantity {product ? `(${product.unit})` : ''}</label>
          <input id="warehouse-quantity" className="form-input" type="number" min={step} step={step}
            value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label" htmlFor="warehouse-reference">Reference / replenishment request</label>
          <input id="warehouse-reference" className="form-input" value={reference}
            onChange={e => setReference(e.target.value)} placeholder="Optional planning reference" />
        </div>
      </div>
      <div className="mt-4 p-3 rounded bg-gray-50 text-sm">
        {valid
          ? `Preview: ${requested} ${product?.unit} of ${product?.name} from ${warehouse?.name} to ${van?.van_number}.`
          : 'Select a warehouse, van and product with sufficient recorded stock to preview a transfer.'}
        {reference.trim() && <div className="text-xs text-gray-500 mt-1">Reference: {reference}</div>}
      </div>
      <button type="button" className="btn btn-primary mt-3 opacity-60 cursor-not-allowed"
        disabled title="Warehouse stock movements have not yet been commissioned">
        Confirm replenishment — not yet enabled
      </button>
    </section>
  )
}
