// Product deletion is intentionally suspended until archival is implemented.
// Existing database foreign keys could cascade-delete stock balances.
export default function RemoveProductButton({ productId }: { productId: string }) {
  return (
    <span
      className="text-xs text-gray-400"
      title="Product deletion is disabled until safe archival is available"
      aria-label="Product deletion unavailable"
    >
      Archive pending
    </span>
  )
}
