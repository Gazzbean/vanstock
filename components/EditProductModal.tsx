'use client'

import { useState, useTransition } from 'react'
import { updateCatalogueProduct } from '@/lib/actions'

type Unit = 'ea'|'kg'|'m'|'pack'|'container'
type Product = {
  id: string
  name: string
  category: string
  stock_unit: string | null
  min_stock: number
  archived_at?: string | null
}

export default function EditProductModal({ product }: { product: Product }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(product.name)
  const [category, setCategory] = useState(product.category)
  const [unit, setUnit] = useState<Unit>((product.stock_unit || 'ea') as Unit)
  const [minimum, setMinimum] = useState(String(product.min_stock))
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const decimal = unit === 'kg' || unit === 'm'
  const changedUnit = unit !== (product.stock_unit || 'ea')
  const validPrecision = decimal ? /^\d+(?:\.\d{1,2})?$/.test(minimum) : /^\d+$/.test(minimum)

  function reset() {
    setName(product.name); setCategory(product.category)
    setUnit((product.stock_unit || 'ea') as Unit)
    setMinimum(String(product.min_stock)); setError('')
  }

  function submit() {
    const qty = Number(minimum)
    if (!name.trim() || !category.trim() || !validPrecision ||
        !Number.isFinite(qty) || qty < 0 || qty >= 1000000000) {
      setError('Enter a product name, category and valid minimum stock quantity.')
      return
    }
    setError('')
    startTransition(async () => {
      try {
        const result = await updateCatalogueProduct(product.id, name, category, unit, qty)
        if (result.error) setError(result.error)
        else setOpen(false)
      } catch {
        setError('Could not confirm the update. Refresh the catalogue before retrying.')
      }
    })
  }

  return <>
    <button className="btn btn-sm" type="button" onClick={() => { reset(); setOpen(true) }}>
      Edit
    </button>
    {open && <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !pending && setOpen(false)}>
      <div className="modal-box">
        <h2 className="text-sm font-medium mb-4">Edit product</h2>
        {error && <div role="alert" className="alert alert-danger mb-3">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="form-label" htmlFor={'edit-name-'+product.id}>Product name</label>
            <input id={'edit-name-'+product.id} className="form-input" maxLength={200}
              value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor={'edit-category-'+product.id}>Category</label>
            <input id={'edit-category-'+product.id} className="form-input" maxLength={100}
              value={category} onChange={e => setCategory(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label" htmlFor={'edit-unit-'+product.id}>Stock unit</label>
              <select id={'edit-unit-'+product.id} className="form-input" value={unit}
                onChange={e => {setUnit(e.target.value as Unit); setMinimum('0')}}>
                <option value="ea">Each (ea)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="m">Metres (m)</option>
                <option value="pack">Pack</option>
                <option value="container">Container</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor={'edit-min-'+product.id}>Minimum stock ({unit})</label>
              <input id={'edit-min-'+product.id} className="form-input" type="number" min="0"
                step={decimal ? '0.01' : '1'} value={minimum}
                onChange={e => setMinimum(e.target.value)} />
            </div>
          </div>
          {changedUnit && <p className="text-xs text-amber-700">
            Changing the stock unit is blocked if this product already has stock records or transaction history.
            Do not change a unit to represent a package conversion.
          </p>}
          <p className="text-xs text-gray-500">
            Editing these details does not change any inventory quantities.
            Historical activity records retain their recorded product names.
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn" type="button" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" type="button" disabled={pending} onClick={submit}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>}
  </>
}
