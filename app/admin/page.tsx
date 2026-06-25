// ============================================================
// app/admin/page.tsx
// Manager-only view: manage products, see all vans and users.
// ============================================================

import { getProducts, getAdminData } from '@/lib/actions'
import AddProductModal from '@/components/AddProductModal'
import RemoveProductButton from '@/components/RemoveProductButton'

export default async function AdminPage() {
  const [products, { vans, profiles }] = await Promise.all([
    getProducts(),
    getAdminData(),
  ])

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">Admin</h1>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 gap-4">

          {/* Product catalogue */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium">Product catalogue</h2>
              <AddProductModal />
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Min</th>
                  <th className="table-header w-12"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{p.name}</td>
                    <td className="table-cell">
                      <span className="badge badge-gray">{p.category}</span>
                    </td>
                    <td className="table-cell text-gray-400">{p.min_stock}</td>
                    <td className="table-cell">
                      <RemoveProductButton productId={p.id} />
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={4} className="table-cell text-center text-gray-400 py-4">
                      No products yet. Add one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            {/* Vans & users */}
            <div className="card">
              <h2 className="text-sm font-medium mb-3">Vans & users</h2>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Van</th>
                    <th className="table-header">Technician</th>
                    <th className="table-header">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p: any) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="table-cell text-gray-500">
                        {p.van?.van_number ?? 'Unassigned'}
                      </td>
                      <td className="table-cell font-medium">{p.full_name}</td>
                      <td className="table-cell">
                        <span className={`badge ${p.role === 'manager' || p.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>
                          {p.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {profiles.length === 0 && (
                    <tr>
                      <td colSpan={3} className="table-cell text-center text-gray-400 py-4">
                        No users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

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
                  <div className="metric-value">{profiles.length}</div>
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
      </div>
    </div>
  )
}
