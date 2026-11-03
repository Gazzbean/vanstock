// Pure stock presentation rules, shared by the technician dashboard and van page.
// A van-specific standard takes precedence over the catalogue fallback minimum.
export type StockClassification = 'mandatory' | 'preferred' | 'optional' | 'not_assigned'

export type StockProduct = {
  id: string
  name: string
  category: string
  stock_unit: string | null
  min_stock: number
}

export type StockBalance = {
  id: string
  product_id: string
  quantity: number
  product: StockProduct | null
}

export type VanStandard = {
  product_id: string
  classification: StockClassification
  min_quantity: number
  target_quantity: number
}

export type StockDisplayRow = StockBalance & {
  minimum: number
  target: number | null
  classification: StockClassification | null
  status: 'Critical' | 'Low' | 'OK' | 'Full' | 'Optional'
  fill: number
}

// Minimum is a replenishment trigger, so reaching it is already a low-stock condition.
// A zero minimum means no threshold has been set.
export function hasReachedMinimum(quantity: number, minimum: number): boolean {
  return minimum > 0 && quantity <= minimum
}

export function buildStockDisplayRows(
  catalogue: StockProduct[],
  existingBalances: StockBalance[],
  standards: VanStandard[],
): StockDisplayRow[] {
  const byId = new Map(catalogue.map(product => [product.id, product]))
  const standardById = new Map(standards.map(standard => [standard.product_id, standard]))
  const rows = new Map<string, StockBalance>()

  // Keep stock for archived items visible until physically reconciled.
  for (const entry of existingBalances) {
    if (!entry.product) continue
    rows.set(entry.product_id, entry)
    if (!byId.has(entry.product_id)) byId.set(entry.product_id, entry.product)
  }

  // A mandatory or preferred item with no balance is still missing stock.
  for (const standard of standards) {
    if (rows.has(standard.product_id)) continue
    if (standard.classification !== 'mandatory' && standard.classification !== 'preferred') continue
    const product = byId.get(standard.product_id)
    if (!product) continue
    rows.set(product.id, { id: `missing:${product.id}`, product_id: product.id, quantity: 0, product })
  }

  return [...rows.values()].map(entry => {
    const standard = standardById.get(entry.product_id)
    const quantity = Number(entry.quantity)
    const minimum = Number(standard?.min_quantity ?? entry.product?.min_stock ?? 0)
    const target = standard ? Number(standard.target_quantity) : null
    const classification = standard?.classification ?? null
    const required = classification === 'mandatory' || classification === 'preferred'
    const status: StockDisplayRow['status'] = quantity <= 0 && (required || minimum > 0)
      ? 'Critical'
      : hasReachedMinimum(quantity, minimum)
        ? 'Low'
        : classification === 'optional' || classification === 'not_assigned'
          ? 'Optional'
          : target !== null && target > 0 && quantity >= target
            ? 'Full'
            : 'OK'
    const scale = target && target > 0 ? target : minimum > 0 ? minimum * 2 : 1
    return { ...entry, quantity, minimum, target, classification, status, fill: Math.max(0, Math.min(quantity / scale, 1)) }
  }).sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''))
}
