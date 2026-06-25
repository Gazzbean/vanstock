// ============================================================
// app/stock/page.tsx
// Shows every item on the current user's van with quantities,
// stock level bars, and an adjust button on each row.
// ============================================================

import { getMyStock, getProducts } from '@/lib/actions'
import AdjustStockModal from '@/components/AdjustStockModal'

function stockStatus(qty: number, min: number) {
  if (qty <= 0)   return { label: 'Critical', cls: 'badge-critical', pct: 0,   color: '#ef4444' }
  if (qty < min)  return { label: 'Low',      cls: 'badge-low',      pct: qty / (min * 2), color: '#f59e0b' }
  return               { label: 'OK',        cls: 'badge-ok',       pct: Math.min(qty / (min * 2), 1), color: '#22c55e' }
}

export default async function StockPage() {
  const [stockItems, products] = await Promise.all([getMyStock(), getProducts()])

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">My Van Stock</h1>
        {/* AdjustStockModal is a Client Component (needs user interaction) */}
        <AdjustStockModal products={products} buttonLabel="+ Adjust quantity" />
      </div>

      <div className="p-5">
        <div className="card">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Item</th>
                <th className="table-header">Category</th>
                <th className="table-header">Qty</th>
                <th className="table-header">Min</th>
                <th className="table-header">Status</th>
                <th className="table-header w-28">Level</th>
                <th className="table-header w-16"></th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((s) => {
                const st = stockStatus(s.quantity, s.product?.min_stock ?? 0)
                const pctPx = Math.round(st.pct * 100)
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{s.product?.name}</td>
                    <td className="table-cell">
                      <span className="badge badge-gray">{s.product?.category}</span>
                    </td>
                    <td className="table-cell font-medium">{s.quantity}</td>
                    <td className="table-cell text-gray-400">{s.product?.min_stock}</td>
                    <td className="table-cell">
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="table-cell">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden w-24">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pctPx}%`, background: st.color }}
                        />
                      </div>
                    </td>
                    <td className="table-cell">
                      <AdjustStockModal
                        products={products}
                        preselectedProductId={s.product_id}
                        buttonLabel="Edit"
                        buttonSmall
                      />
                    </td>
                  </tr>
                )
              })}
              {stockItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-cell text-center text-gray-400 py-6">
                    No stock items found. Ask your manager to add products.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
