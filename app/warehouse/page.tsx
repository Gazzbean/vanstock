// Read-only warehouse overview. Stock movements remain disabled until rollout approval.
import { redirect } from 'next/navigation'
import { getCurrentUserDisplay, getWarehouseOverview } from '@/lib/actions'

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

  const overview = await getWarehouseOverview()
  const totals = overview.warehouses.map((warehouse) => {
    const rows = overview.items.filter((item) => item.warehouse_id === warehouse.id)
    return {
      id: warehouse.id,
      name: warehouse.name,
      total: rows.reduce((sum, row) => sum + row.quantity, 0),
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
          Warehouse overview only. Stock transfers and opening balance adjustments are not enabled yet.
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
                  <div className="text-right">
                    <div className="text-xl font-semibold">{warehouse.total}</div>
                    <div className="text-xs text-gray-500">Total units (discrete stock)</div>
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
                            <td className="table-cell">{row.quantity}</td>
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
      </div>
    </div>
  )
}
