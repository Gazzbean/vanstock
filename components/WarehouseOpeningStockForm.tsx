'use client'

import HelpPopover from './HelpPopover'
import StatusNotice from './StatusNotice'
import { useRef, useState, useTransition } from 'react'
import {transactionBorder} from '@/lib/transaction-confirmation'
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
  const inFlight = useRef(false)
  const [completed,setCompleted] = useState(false)

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
    if (!enabled || pending || inFlight.current || completed) return
    inFlight.current = true
    startTransition(async () => {
      try {
        const result = await postWarehouseOpeningStock(warehouseId, productId, amount, reference.trim())
        if (result.error) setError(result.error)
        else {
          setSuccess('Opening balance posted. Refresh the page to see the updated stock.')
          setCompleted(true)
          setProductId('')
          setQuantity('0')
        }
      } catch {
        setError('Unable to post opening stock. No confirmation was received.')
      } finally {inFlight.current = false}
    })
  }

  return (
    <section className={'card mt-4 border-2 '+transactionBorder(completed?'success':error?'error':pending?'pending':valid&&enabled?'ready':'idle')}>
      <div className="flex items-center justify-between gap-2 mb-2"><h2 className="text-sm font-semibold">Opening warehouse stocktake</h2><HelpPopover title="Opening warehouse stocktake" steps={["Enter the verified opening count once for each product with a stocktake reference.", "Posted balances cannot be overwritten here."]} href="/help#stocktake" /></div>
      {!enabled && <StatusNotice tone="warning" title="Opening stock posting unavailable">Opening stock posting is currently disabled by the administrator.</StatusNotice>}
      <div className="mt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="opening-warehouse" className="form-label">Warehouse</label>
          <select disabled={!enabled || pending} id="opening-warehouse" className="form-input disabled:opacity-50 disabled:cursor-not-allowed" value={warehouseId}
            onChange={e => { setWarehouseId(e.target.value); setProductId(''); setCompleted(false);setSuccess('');setError('') }}>
            <option value="">Select warehouse</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="opening-product" className="form-label">Product</label>
          <select disabled={!enabled || pending} id="opening-product" className="form-input disabled:opacity-50 disabled:cursor-not-allowed" value={productId}
            onChange={e => {setProductId(e.target.value);setCompleted(false);setSuccess('');setError('')}}>
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
          <input disabled={!enabled || pending} id="opening-count" className="form-input disabled:opacity-50 disabled:cursor-not-allowed" type="number" min="0"
            step={isDecimal ? '0.01' : '1'} value={quantity}
            onChange={e => {setQuantity(e.target.value);setCompleted(false);setSuccess('');setError('')}} />
        </div>
        <div>
          <div className="flex items-center gap-1"><label htmlFor="opening-reference" className="form-label">Approved stocktake reason / existing reference</label><HelpPopover title="Stocktake reference" steps={['Enter the count sheet reference or approved reason so the count can be traced.','A unique STK number is generated automatically on posting.']} /></div>
          <input disabled={!enabled || pending} id="opening-reference" className="form-input disabled:opacity-50 disabled:cursor-not-allowed" value={reference}
            onChange={e => {setReference(e.target.value);setCompleted(false);setSuccess('');setError('')}} placeholder="e.g. Opening count approved by manager" />

        </div>
      </div>
      </div>
      {hasBalance && <div className="mt-3"><StatusNotice tone="warning" title="Opening stock already recorded">A balance already exists for this product; opening stock cannot overwrite it.</StatusNotice></div>}
      {error && <div className="mt-3"><StatusNotice tone="error" title="Opening stock not posted">{error}</StatusNotice></div>}
      {success && <div className="mt-3"><StatusNotice tone="success" title="Opening stock posted">{success}</StatusNotice></div>}
      <button type="button" className="btn btn-primary mt-4 disabled:!bg-gray-200 disabled:!text-gray-500 disabled:cursor-not-allowed"
        disabled={!enabled || pending || completed || !valid} onClick={submit}>
        {completed ? 'Opening stock recorded' : pending ? 'Posting…' : enabled ? 'Post opening stock' : 'Opening stock posting — not yet enabled'}
      </button>
    </section>
  )
}
