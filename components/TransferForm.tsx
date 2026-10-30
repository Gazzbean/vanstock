// ============================================================
// components/TransferForm.tsx
// The interactive form for recording stock transfers.
// 'use client' because it manages form state in the browser.
// ============================================================

'use client'

import { useState, useTransition } from 'react'
import { recordTransfer } from '@/lib/actions'
import type { Product, StockItem, TransferType } from '@/types'

interface Props {
  products: Product[]
  stockItems: StockItem[]
  destinationVans: { id: string; van_number: string }[]
}

const destLabels: Record<string, string> = {
  issue:        'Customer / site reference',
  return:       'Customer / site reference',
  'van-to-van': 'Reference / job (optional)',
  depot:        'Depot name',
}

export default function TransferForm({ products, stockItems, destinationVans }: Props) {
  const [type, setType] = useState<TransferType>('issue')
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [destinationVanId, setDestinationVanId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isPending, startTransition] = useTransition()

  // Current stock for selected product
  const currentStock = stockItems.find((s) => s.product_id === productId)?.quantity ?? 0

  function handleSubmit() {
    setError('')
    setSuccess('')

    if (type === 'van-to-van' && !destinationVanId) {
      setError('Select the receiving van')
      return
    }
    if (type !== 'van-to-van' && !reference.trim()) {
      setError('Please enter a reference (customer name, site, etc.)')
      return
    }

    startTransition(async () => {
      const result = await recordTransfer({ type, product_id: productId, quantity: qty, reference, notes, destination_van_id: type === 'van-to-van' ? destinationVanId : undefined })
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess('Transfer recorded successfully.')
        setReference('')
        setNotes('')
        setQty(1)
        setDestinationVanId('')
      }
    })
  }

  return (
    <div className="card">
      <h2 className="text-sm font-medium mb-4">New transfer</h2>

      {error   && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="space-y-3">
        <div>
          <label className="form-label">Transfer type</label>
          <select className="form-input" value={type} onChange={(e) => setType(e.target.value as TransferType)}>
            <option value="issue">Issue to customer</option>
            <option value="return">Return from customer</option>
            <option value="van-to-van">Van-to-van transfer</option>
            <option value="depot">Return to depot</option>
          </select>
        </div>

        {type === 'van-to-van' && (
          <div>
            <label className="form-label" htmlFor="destination-van">Receiving van</label>
            <select
              id="destination-van"
              className="form-input"
              value={destinationVanId}
              onChange={(e) => setDestinationVanId(e.target.value)}
            >
              <option value="">Select receiving van</option>
              {destinationVans.map((van) => (
                <option key={van.id} value={van.id}>{van.van_number}</option>
              ))}
            </select>
            {destinationVans.length === 0 && (
              <p className="text-xs text-red-600 mt-1">No other vans are available.</p>
            )}
          </div>
        )}

        <div>
          <label className="form-label">Item</label>
          <select className="form-input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => {
              const onVan = stockItems.find((s) => s.product_id === p.id)?.quantity ?? 0
              return (
                <option key={p.id} value={p.id}>
                  {p.name} (on van: {onVan})
                </option>
              )
            })}
          </select>
        </div>

        <div>
          <label className="form-label">Quantity</label>
          <input
            className="form-input"
            type="number"
            min={1}
            max={type !== 'return' ? currentStock : undefined}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          />
          {type !== 'return' && (
            <p className="text-xs text-gray-400 mt-1">
              {currentStock} available on van
            </p>
          )}
        </div>

        <div>
          <label className="form-label">{destLabels[type]}</label>
          <input
            className="form-input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. Site name or job number"
          />
        </div>

        <div>
          <label className="form-label">Notes (optional)</label>
          <input
            className="form-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details"
          />
        </div>

        <button
          className="btn btn-primary w-full justify-center"
          onClick={handleSubmit}
          disabled={isPending || (type === 'van-to-van' && destinationVans.length === 0)}
        >
          {isPending ? 'Recording…' : '✓ Confirm transfer'}
        </button>
      </div>
    </div>
  )
}
