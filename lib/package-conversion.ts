// Supplier purchase units convert to the product's canonical stock unit.
// Whole-number stock units must not accept fractional package conversions.
export function isValidPackageConversion(quantity: number, stockUnit: string | null): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= 1_000_000_000) return false
  if (Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-7) return false
  if (['ea', 'pack', 'container'].includes(stockUnit ?? 'ea') && !Number.isSafeInteger(quantity)) return false
  return true
}
