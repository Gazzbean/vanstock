// ============================================================
// app/admin/page.tsx
// Manager-only view: manage products, see all vans and users.
// ============================================================

import { getAdminProducts, getAdminData, getCurrentUserDisplay, getWarehousePermissionData, getManagerOperationPermissions, getPhase1CatalogueSettings, getPhase1BSupplierData, getVanStockStandardsAdmin, getFleetStockOverview, getConsumablesAssignments, getUserAccessCapabilities, getUserAuthorizedVans, getWarehouseStockStandards } from '@/lib/actions'
import { redirect } from 'next/navigation'
import AddProductModal from '@/components/AddProductModal'
import EditProductModal from '@/components/EditProductModal'
import CatalogueImport from '@/components/CatalogueImport'
import CatalogueSettingsPanel from '@/components/CatalogueSettingsPanel'
import SupplierAndBinsPanel from '@/components/SupplierAndBinsPanel'
import VanStockStandardsPanel from '@/components/VanStockStandardsPanel'
import FleetStandardsOverview from '@/components/FleetStandardsOverview'
import ConsumablesAssignmentsPanel from '@/components/ConsumablesAssignmentsPanel'
import RemoveProductButton from '@/components/RemoveProductButton'
import WarehousePermissionsPanel from '@/components/WarehousePermissionsPanel'
import ManagerPermissionsPanel from '@/components/ManagerPermissionsPanel'
import AdminTabbedSections from '@/components/AdminTabbedSections'
import UsersAccessPanel from '@/components/UsersAccessPanel'
import AuthorizedVansPanel from '@/components/AuthorizedVansPanel'
import ProductCatalogueTable from '@/components/ProductCatalogueTable'
import VehicleRegisterPanel from '@/components/VehicleRegisterPanel'
import WarehouseStandardsPanel from '@/components/WarehouseStandardsPanel'

export default async function AdminPage() {
  const user = await getCurrentUserDisplay()
  if (!user) redirect('/login')
  if (user.role !== 'manager' && user.role !== 'admin') {
    return <div><div className="topbar"><h1 className="topbar-title">Admin</h1></div>
      <div className="p-5"><div className="card"><h2 className="text-sm font-medium">Manager access required</h2>
      <p className="text-sm text-gray-500 mt-2">You do not have permission to access administration.</p></div></div></div>
  }
  if (user.role === 'manager' && !user.manager_operations?.maintain_catalogue) {
    if (!user.manager_operations?.maintain_vehicles) return <div className="p-5"><h1 className="text-lg font-semibold">Administration</h1><p className="mt-2 text-sm text-gray-600">No administration responsibilities have been assigned to your account.</p></div>
    const {vans}=await getAdminData()
    return <div><div className="topbar"><h1 className="topbar-title">Vehicles</h1></div><div className="p-5"><p className="text-sm text-gray-600 mb-4">Your assigned Manager responsibility: maintain the vehicle register.</p><VehicleRegisterPanel canEdit={true} vans={vans}/></div></div>
  }
  const [products, { vans, profiles }, warehousePermissions, managerPermissions, phase1, phase1b, vanStandards, fleetBalances, consumablesAssignments, capabilities, userVans, warehouseStandards] = await Promise.all([
    getAdminProducts(),
    getAdminData(),
    user.role === 'admin' ? getWarehousePermissionData() : Promise.resolve(null),
    user.role === 'admin' ? getManagerOperationPermissions() : Promise.resolve([]),
    getPhase1CatalogueSettings(),
    getPhase1BSupplierData(),
    getVanStockStandardsAdmin(),
    getFleetStockOverview(),
    getConsumablesAssignments(),
    getUserAccessCapabilities(),
    getUserAuthorizedVans(),
    getWarehouseStockStandards(),
  ])
  const archiveEnabled = process.env.WAREHOUSE_WRITES_ENABLED === 'true'
  return (
    <div>
      <div className="topbar"><h1 className="topbar-title">Admin</h1></div>
      <div className="p-5">
        <AdminTabbedSections
          catalogue={<><div className="space-y-4">
  <div className="grid grid-cols-1 gap-4">          {/* Product catalogue */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium">Product catalogue</h2>
              <AddProductModal />
            </div>
            <ProductCatalogueTable products={products} archiveEnabled={archiveEnabled}/>
          </div>

</div>
  <CatalogueSettingsPanel products={products.map(p=>({id:p.id,name:p.name}))} settings={phase1.settings} groups={phase1.groups} />
  <CatalogueImport />
</div></>}
          suppliers={<SupplierAndBinsPanel products={products.map(p=>({id:p.id,name:p.name,stock_unit:p.stock_unit}))} suppliers={phase1b.suppliers} options={phase1b.options} bins={phase1b.bins} vans={phase1b.vans} warehouses={phase1b.warehouses} hints={phase1b.hints} usageGroups={consumablesAssignments.groups} usageAssignments={consumablesAssignments.assignments} />}
          standards={<>
            <VanStockStandardsPanel products={products.map(p=>({id:p.id,name:p.name,stock_unit:p.stock_unit,archived_at:p.archived_at}))} vans={phase1b.vans} standards={vanStandards} />
            <WarehouseStandardsPanel products={products.map(p=>({id:p.id,name:p.name,stock_unit:p.stock_unit,archived_at:p.archived_at}))} warehouses={phase1b.warehouses} standards={warehouseStandards}/>
            <FleetStandardsOverview products={products.map(p=>({id:p.id,name:p.name,stock_unit:p.stock_unit,archived_at:p.archived_at}))} vans={phase1b.vans} standards={vanStandards} balances={fleetBalances} />
          </>}
          consumables={<ConsumablesAssignmentsPanel products={products.map(p=>({id:p.id,name:p.name,stock_unit:p.stock_unit,archived_at:p.archived_at}))} groups={consumablesAssignments.groups} assignments={consumablesAssignments.assignments} />}
          access={<><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">          <div className="space-y-4">
            <UsersAccessPanel canEdit={user.role === 'admin'} vans={vans.filter((v:any)=>v.active!==false).map((v:any)=>({id:v.id,van_number:v.van_number}))} capabilities={capabilities} users={profiles.map((p:any)=>({id:p.id,full_name:p.full_name,initials:p.initials??null,role:p.role,is_active:p.is_active!==false,van_number:p.van?.van_number??null}))} />
            <AuthorizedVansPanel canEdit={user.role === 'admin'} users={profiles.map((p:any)=>({id:p.id,full_name:p.full_name,initials:p.initials??null,van_id:p.van_id??null}))} vans={vans.filter((v:any)=>v.active!==false).map((v:any)=>({id:v.id,van_number:v.van_number}))} initial={userVans} />
            <VehicleRegisterPanel canEdit={Boolean(user.manager_operations?.maintain_vehicles)} vans={vans} />
            {/* Summary stats */}
            <div className="card">
              <h2 className="text-sm font-medium mb-3">System summary</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="metric-card">
                  <div className="metric-label">Total vans</div>
                  <div className="metric-value">{vans.length}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Active users</div>
                  <div className="metric-value">{profiles.filter((p:any)=>p.is_active!==false).length}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Product types</div>
                  <div className="metric-value">{products.length}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Low stock items</div>
                  <div className="metric-value text-amber-600">—</div>
                </div>
              </div>
            </div>
          </div>

</div>
{user.role === 'admin' && <div className="mt-4"><ManagerPermissionsPanel managers={profiles.filter((p:any)=>p.role==='manager' && p.is_active!==false).map((p:any)=>({id:p.id,full_name:p.full_name}))} initialGrants={managerPermissions} /></div>}
{user.role === 'admin' && warehousePermissions && (
  <div className="mt-4"><WarehousePermissionsPanel users={profiles.map((p: any) => ({ id: p.id, full_name: p.full_name, initials: p.initials??null, is_active: p.is_active!==false, office_access: capabilities.some((a:any)=>a.user_id===p.id && a.office_access), technician_access: capabilities.some((a:any)=>a.user_id===p.id && a.technician_access), admin_access: p.role==='admin', van_number: p.van?.van_number ?? null }))} saved={warehousePermissions} /></div>
)}</>}
        />
      </div>
    </div>
  )
}
