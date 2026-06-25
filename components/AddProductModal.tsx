// ============================================================
// components/AddProductModal.tsx
// Popup form for adding a new product to the catalogue.
// ============================================================

'use client'

import { useState, useTransition } from 'react'
import { addProduct } from '@/lib/actions'

export default function AddProductModal() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Gas cylinder')
  const [minStock, setMinStock] = useState(2)
  const [startingQty, setStartingQty] = useState(0)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!name.trim()) { setError('Enter a product name'); return }
    setError('')
    startTransition(async () => {
      const result = await addProduct(name, category, minStock, startingQty)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        setName('')
        setStartingQty(0)
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary btn-sm">+ Add item</button>

      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">Add product</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <div className="space-y-3">
              <div>
                <label className="form-label">Product name</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acetylene D cylinder" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option>Gas cylinder</option>
                    <option>Regulator</option>
                    <option>Fitting</option>
                    <option>Safety equipment</option>
                    <option>Tool</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Min stock level</label>
                  <input className="form-input" type="number" min={0} value={minStock} onChange={(e) => setMinStock(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div>
                <label className="form-label">Starting qty on this van</label>
                <input className="form-input" type="number" min={0} value={startingQty} onChange={(e) => setStartingQty(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={isPending}>
                {isPending ? 'Adding…' : 'Add product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
