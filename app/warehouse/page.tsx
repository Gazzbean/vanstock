// Warehouse stock overview and audited stocktake/replenishment actions.
import { redirect } from 'next/navigation'
import WarehouseReplenishmentDraft from '@/components/WarehouseReplenishmentDraft'
import WarehouseOpeningStockForm from '@/components/WarehouseOpeningStockForm'
import { getCurrentUserDisplay, getWarehouseOverview, getAdminData, getProducts } from '@/lib/actions'

export default async function WarehousePage() {
  const user = await getCurrentUserDisplay()
  if (!user) redirect('/login')
  if (user.role !== 'admin' && user.role !== 'manager') {
    return (
      <div className="p-5">
        <h1 className="text-lg font-semibold">Warehouse</h1>
        <p className="text-sm text-gray-600 mt-2">Warehouse management access required.</p>
      </div>
    )
  }

  const [overview, adminData, products] = await Promise.all([
    getWarehouseOverview(), getAdminData(), getProducts(),
  ])
  const writesEnabled = process.env.WAREHOUSE_WRITES_ENABLED !== 'false' && !overview.setupRequired
  const productUnits = new Map(products.map(p => [p.id, p.stock_unit ?? 'ea']))
  const totals = overview.warehouses.map((warehouse) => {
    const rows = overview.items.filter((item) => item.warehouse_id === warehouse.id)
      .map(item => ({ ...item, unit: productUnits.get(item.product_id) ?? 'ea' }))
    return {
      id: warehouse.id,
      name: warehouse.name,
      productTypes: rows.length,
      rows,
    }
  })

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">Warehouse Stock</h1>
      </div>
      <div className="p-5">
        <div className="alert alert-info mb-4">
          Warehouse quantities are shown by product and unit. Opening stock and replenishment are recorded with an audit reference.
        </div>
        {overview.setupRequired ? (
          <div className="card">
            <h2 className="text-sm font-medium">Warehouse setup is pending</h2>
            <p className="text-sm text-gray-500 mt-2">
              The warehouse database migration has not been installed. Existing van inventory is unchanged.
            </p>
          </div>
        ) : totals.length === 0 ? (
          <div className="card">
            <p className="text-sm text-gray-500">No warehouse locations are configured.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {totals.map((warehouse) => (
              <section key={warehouse.id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-medium">{warehouse.name}</h2>
                    <p className="text-xs text-gray-500">
                      {warehouse.productTypes} product types with recorded balances
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    Quantities shown by product and unit
                  </div>
                </div>
                {warehouse.rows.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No opening stock balances have been entered. This does not mean the physical warehouse is empty.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="table-header">Item</th>
                          <th className="table-header">Category</th>
                          <th className="table-header">Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {warehouse.rows.map((row) => (
                          <tr key={row.product_id}>
                            <td className="table-cell font-medium">{row.product_name}</td>
                            <td className="table-cell">{row.category}</td>
                            <td className="table-cell">{row.quantity} {row.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
        <WarehouseReplenishmentDraft
          enabled={writesEnabled}
          warehouses={overview.warehouses.map(w => ({ id: w.id, name: w.name }))}
          vans={adminData.vans.map(v => ({ id: v.id, van_number: v.van_number }))}
          products={products.map(p => ({ id: p.id, name: p.name, unit: p.stock_unit ?? 'ea' }))}
          balances={overview.items.map(i => ({ warehouse_id: i.warehouse_id, product_id: i.product_id, quantity: i.quantity }))}
        />
        <WarehouseOpeningStockForm
          enabled={writesEnabled}
          warehouses={overview.warehouses.map(w => ({ id: w.id, name: w.name }))}
          products={products.map(p => ({ id: p.id, name: p.name, unit: p.stock_unit ?? 'ea' }))}
          balances={overview.items.map(i => ({ warehouse_id: i.warehouse_id, product_id: i.product_id, quantity: i.quantity }))}
        />
      </div>
    </div>
  )
}
