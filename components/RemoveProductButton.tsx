'use client'

import { useState, useTransition } from 'react'
import { setProductArchived } from '@/lib/actions'

// Never deletes a product. Archived products remain in stock and audit history.
export default function RemoveProductButton({
  productId, archived = false, enabled = false,
}: {
  productId: string
  archived?: boolean
  enabled?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  function submit() {
    if (!enabled) return
    if (!confirm(archived ? 'Restore this product to the active catalogue?' :
      'Archive this product? This is allowed only when all van and warehouse balances are zero.')) return
    startTransition(async () => {
      setError('')
      try {
        const result = await setProductArchived(productId, !archived)
        if (result.error) setError(result.error)
      } catch {
        setError('The catalogue could not be updated.')
      }
    })
  }
  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="btn btn-sm"
        disabled={!enabled || pending} onClick={submit}
        title={enabled ? (archived ? 'Restore product' : 'Archive unused product') :
          'Archiving is disabled until warehouse commissioning'}>
        {archived ? 'Restore' : 'Archive'}
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  )
}
