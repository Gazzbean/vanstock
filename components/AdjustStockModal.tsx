// ============================================================
// components/AdjustStockModal.tsx
// The popup form for adjusting stock quantities.
// 'use client' is needed because it manages open/close state
// and calls a Server Action when the form is submitted.
// ============================================================

'use client'

import { useState, useTransition } from 'react'
import { adjustStock } from '@/lib/actions'
import type { Product } from '@/types'

interface Props {
  products: Product[]
  preselectedProductId?: string
  buttonLabel?: string
  buttonSmall?: boolean
}

export default function AdjustStockModal({
  products,
  preselectedProductId,
  buttonLabel = '+ Adjust stock',
  buttonSmall = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState(preselectedProductId ?? products[0]?.id ?? '')
  const [action, setAction] = useState<'add' | 'remove' | 'set'>('add')
  const [qty, setQty] = useState('1')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const selected = products.find(p => p.id === productId)
  const unit = selected?.stock_unit ?? 'ea'
  const decimal = unit === 'kg' || unit === 'm'
  const quantity = Number(qty)
  const precisionOK = decimal ? /^\d+(?:\.\d{1,3})?$/.test(qty) : /^\d+$/.test(qty)

  function handleSubmit() {
    setError('')
    if (!reason.trim()) { setError('Enter a reason for the adjustment'); return }
    if (!precisionOK || !Number.isFinite(quantity) || quantity < 0 || (quantity === 0 && action !== 'set')) {
      setError('Enter a valid quantity in ' + unit)
      return
    }
    startTransition(async () => {
      const result = await adjustStock({ product_id: productId, action, quantity, reason })
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        setReason('')
      }
    })
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className={`btn ${buttonSmall ? 'btn-sm' : 'btn-primary'}`}
      >
        {buttonLabel}
      </button>

      {/* Modal */}
      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">Adjust stock quantity</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            {error && <div className="alert alert-danger mb-3">{error}</div>}

            <div className="space-y-3">
              <div>
                <label className="form-label">Item</label>
                <select
                  className="form-input"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Action</label>
                  <select
                    className="form-input"
                    value={action}
                    onChange={(e) => setAction(e.target.value as typeof action)}
                  >
                    <option value="add">Add stock</option>
                    <option value="remove">Remove stock</option>
                    <option value="set">Set exact quantity</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Quantity ({unit})</label>
                  <input
                    className="form-input"
                    type="number"
                    min={action === 'set' ? 0 : decimal ? 0.001 : 1}
                    step={decimal ? 0.001 : 1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Reason</label>
                <input
                  className="form-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Loaded from depot"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? 'Saving…' : 'Save adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
