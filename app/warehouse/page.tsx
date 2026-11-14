// Warehouse stock overview and audited stocktake/replenishment actions.
import { redirect } from 'next/navigation'
import WarehouseOpeningStockForm from '@/components/WarehouseOpeningStockForm'
import WarehouseCorrections from '@/components/WarehouseCorrections'
import WarehouseRequestQueue from '@/components/WarehouseRequestQueue'
import WarehouseRequestForm from '@/components/WarehouseRequestForm'
import TechnicianWarehouseMovement from '@/components/TechnicianWarehouseMovement'
import { getCurrentUserDisplay, getWarehouseOverview, getAdminData, getProducts, getWarehouseRequests, getMyWarehouseRights, getWarehouseStockStandards, getJobMaterialAllocations, getCompanyVanLabels, getWarehouseRequestPackages } from '@/lib/actions'
import {warehouseWritesEnabled} from '@/lib/warehouse-release'

export default async function WarehousePage() {
  const user = await getCurrentUserDisplay()
  if (!user) redirect('/login')
  if (!user.access?.office_access && !user.manager_operations?.warehouse_access) {
    return (
      <div className="p-5">
        <h1 className="text-lg font-semibold">Warehouse</h1>
        <p className="text-sm text-gray-600 mt-2">Warehouse permission required.</p>
      </div>
    )
  }

  const rights = await getMyWarehouseRights()
  const canManage = rights.canManageRequests || rights.canAdjust || rights.canReceiveRequests
  const [overview, adminData, products,requests,thresholds,siteAllocations,companyVans,packages] = await Promise.all([
    getWarehouseOverview(), canManage ? getAdminData() : Promise.resolve(null), getProducts(),getWarehouseRequests(),
    getWarehouseStockStandards(),getJobMaterialAllocations(),getCompanyVanLabels(),getWarehouseRequestPackages(),
  ])
  const writesEnabled = warehouseWritesEnabled(process.env.WAREHOUSE_WRITES_ENABLED) && !overview.setupRequired
  const productUnits = new Map(products.map(p => [p.id, p.stock_unit ?? 'ea']))
  const totals = overview.warehouses.map((warehouse) => {
    const rows = overview.items.filter((item) => item.warehouse_id === warehouse.id)
      .map(item => {
        const threshold=thresholds.find(s=>s.warehouse_id===warehouse.id && s.product_id===item.product_id)
        const min=threshold?Number(threshold.min_quantity):null
        const target=threshold?Number(threshold.target_quantity):null
        return { ...item, unit:productUnits.get(item.product_id)??'ea',minimum:min,target,
          status:min===null||min===0?'Not set':Number(item.available_quantity)<=min?'Reorder':target!==null&&Number(item.available_quantity)<target?'Below target':'OK' }
      })
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
        <section className="card mb-4">
          <h2 className="text-sm font-semibold mb-2">Materials allocated to jobs — awaiting use or return</h2>
          <p className="text-xs text-gray-500 mb-3">Office review: materials are no longer in van stock but have not yet been confirmed as used. Location and reason must be recorded.</p>
          {!siteAllocations.length?<p className="text-sm text-gray-500">No outstanding on-site allocations.</p>:<div className="overflow-x-auto"><table className="w-full"><thead><tr>
            <th className="table-header">Job</th><th className="table-header">Material</th><th className="table-header">Quantity</th><th className="table-header">Van</th><th className="table-header">Location</th><th className="table-header">Reason</th><th className="table-header">Date</th>
          </tr></thead><tbody>{siteAllocations.map(a=><tr key={a.id}>
            <td className="table-cell">{a.job_reference}</td><td className="table-cell">{products.find(p=>p.id===a.product_id)?.name??'—'}</td><td className="table-cell">{a.quantity} {products.find(p=>p.id===a.product_id)?.stock_unit??'ea'}</td>
            <td className="table-cell">{companyVans.find(v=>v.id===a.van_id)?.van_number??'Unknown van'}</td><td className="table-cell">{a.site_location}</td><td className="table-cell">{a.reason}</td><td className="table-cell">{new Date(a.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</td>
          </tr>)}</tbody></table></div>}
        </section>
        <div className="alert alert-info mb-4">
          Warehouse stock shows recorded quantity, committed stock already issued to vans, and available stock for new issues. Issued goods remain committed until receiving confirmation. Opening stock and replenishment are audited.
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
                          <th className="table-header">Recorded</th>
                          <th className="table-header">Committed</th>
                          <th className="table-header">Available</th>
                          <th className="table-header">Warehouse min</th>
                          <th className="table-header">Target</th>
                          <th className="table-header">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {warehouse.rows.map((row) => (
                          <tr key={row.product_id}>
                            <td className="table-cell font-medium">{row.product_name}</td>
                            <td className="table-cell">{row.category}</td>
                            <td className="table-cell">{row.quantity} {row.unit}</td>
                            <td className="table-cell">{row.committed_quantity} {row.unit}</td>
                            <td className="table-cell font-semibold">{row.available_quantity} {row.unit}</td>
                            <td className="table-cell">{row.minimum===null?'—':row.minimum+' '+row.unit}</td>
                            <td className="table-cell">{row.target===null?'—':row.target+' '+row.unit}</td>
                            <td className="table-cell">{row.status}</td>
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
        {(rights.canRequest || rights.canManageRequests) && <WarehouseRequestQueue
          requests={requests} warehouses={overview.warehouses.map(w=>({id:w.id,name:w.name}))}
          vans={companyVans.map(v=>({id:v.id,van_number:v.van_number}))}
          products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))}
          canManage={rights.canManageRequests} canApprove={rights.canApproveRequests} canIssue={rights.canIssueRequests} canReceive={rights.canReceiveRequests} writesEnabled={writesEnabled}
          balances={overview.items.map(i=>({warehouse_id:i.warehouse_id,product_id:i.product_id,quantity:i.available_quantity}))}
        />}
        {(canManage||rights.canRequest) && !overview.setupRequired && <WarehouseRequestForm
          warehouses={overview.warehouses.map(w=>({id:w.id,name:w.name}))}
          products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))}
          vans={companyVans} selectedVanId={companyVans[0]?.id??null}
          balances={overview.items.map(i=>({warehouse_id:i.warehouse_id,product_id:i.product_id,quantity:i.available_quantity}))}
          packages={packages}
        />}
        {rights.canReceive && <TechnicianWarehouseMovement
          warehouses={overview.warehouses.map(w=>({id:w.id,name:w.name}))}
          products={products.map(p=>({id:p.id,name:p.name,unit:p.stock_unit??'ea'}))}
          defaultVanId={companyVans[0]?.id??null} vans={companyVans}
          canIssue={false} canReceive={rights.canReceive}
          enabled={writesEnabled}
        />}
        {rights.canAdjust ? <>
        <WarehouseCorrections
          enabled={writesEnabled}
          warehouses={overview.warehouses.map(w => ({ id: w.id, name: w.name }))}
          vans={(adminData?.vans??[]).map(v => ({ id: v.id, van_number: v.van_number }))}
          products={products.map(p => ({ id: p.id, name: p.name, unit: p.stock_unit ?? 'ea' }))}
          balances={overview.items.map(i => ({ warehouse_id: i.warehouse_id, product_id: i.product_id, quantity: i.quantity,committed_quantity:i.committed_quantity }))}
        />
        <WarehouseOpeningStockForm
          enabled={writesEnabled}
          warehouses={overview.warehouses.map(w => ({ id: w.id, name: w.name }))}
          products={products.map(p => ({ id: p.id, name: p.name, unit: p.stock_unit ?? 'ea' }))}
          balances={overview.items.map(i => ({ warehouse_id: i.warehouse_id, product_id: i.product_id, quantity: i.quantity }))}
        />
        </> : <p className="text-xs text-gray-500 mt-4">Office stock overview is read-only. Transfers, adjustments and stocktakes require warehouse-management authorisation.</p>}
      </div>
    </div>
  )
}
