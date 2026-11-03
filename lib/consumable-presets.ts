// Quick-use quantities are configured per unit of measure, not per supplier pack.
export function validQuickUseOptions(values: number[], unit: string): boolean {
  if (values.length !== 4) return false
  const counted = ['ea', 'pack', 'container'].includes(unit)
  return values.every((value, i) =>
    Number.isFinite(value) && value > 0 && value < 1_000_000_000 &&
    Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7 &&
    (!counted || Number.isSafeInteger(value)) &&
    (i === 0 || value > values[i - 1]),
  )
}
