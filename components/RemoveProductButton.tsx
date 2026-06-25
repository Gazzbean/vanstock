// ============================================================
// components/RemoveProductButton.tsx
// A simple delete button for removing a product.
// Needs 'use client' because it calls a Server Action on click.
// ============================================================

'use client'

import { useTransition } from 'react'
import { removeProduct } from '@/lib/actions'

export default function RemoveProductButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('Remove this product? Stock entries will also be deleted.')) return
    startTransition(async () => {
      await removeProduct(productId)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="btn btn-sm btn-danger"
      aria-label="Remove product"
    >
      {isPending ? '…' : '🗑'}
    </button>
  )
}
