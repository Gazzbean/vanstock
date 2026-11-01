'use client'

import { useEffect, useState, useTransition } from 'react'
import { saveWarehousePermissions } from '@/lib/actions'

type Permissions = {
  can_view: boolean
  can_request: boolean
  can_issue: boolean
  can_receive: boolean
  can_adjust: boolean
  can_stocktake: boolean
}
type User = { id:string; full_name:string; initials:string|null; is_active:boolean; office_access:boolean; technician_access:boolean; admin_access:boolean; van_number:string|null }
type Row = Permissions & { user_id: string }
const defaults: Permissions = {
  can_view: false, can_request: false, can_issue: false,
  can_receive: false, can_adjust: false, can_stocktake: false,
}
const options: { key: keyof Permissions; label: string; description: string }[] = [
  { key: 'can_view', label: 'View warehouse stock', description: 'See available warehouse quantities' },
  { key: 'can_request', label: 'Request replenishment', description: 'Request stock from warehouse' },
  { key: 'can_issue', label: 'Issue warehouse stock', description: 'Move stock from warehouse to a van' },
  { key: 'can_receive', label: 'Receive warehouse returns', description: 'Receive returned stock from a van' },
  { key: 'can_adjust', label: 'Adjust warehouse balances', description: 'Correct quantities with a recorded reason' },
  { key: 'can_stocktake', label: 'Perform warehouse stocktakes', description: 'Carry out counts and submit variances' },
]

export default function WarehousePermissionsPanel({ users, saved }: { users: User[]; saved: Row[] }) {
  const [userId, setUserId] = useState(users[0]?.id ?? '')
  const [permissions, setPermissions] = useState<Permissions>(defaults)
  const currentUser=users.find(u=>u.id===userId)
  const savedRow=saved.find(row=>row.user_id===userId)
  const effectiveView=Boolean(currentUser?.office_access)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const row = saved.find((item) => item.user_id === userId)
    setPermissions(row ? {
      can_view: row.can_view, can_request: row.can_request,
      can_issue: row.can_issue, can_receive: row.can_receive,
      can_adjust: row.can_adjust, can_stocktake: row.can_stocktake,
    } : { ...defaults })
    setMessage('')
    setError('')
  }, [userId, saved])

  function save() {
    setMessage('')
    setError('')
    startTransition(async () => {
      try {
        const result = await saveWarehousePermissions(userId, {...permissions,can_view:effectiveView})
        if (result.error) setError(result.error)
        else setMessage('Warehouse permission settings saved and audited.')
      } catch {
        setError('Could not save permissions. Please try again.')
      }
    })
  }

  return (
    <div className="card">
      <h2 className="text-sm font-medium mb-1">Warehouse permissions</h2>
      <p className="text-xs text-gray-500 mb-4">
        Administrator-managed warehouse permissions. Viewing warehouse inventory follows Office access in Users & Access. No permission is granted merely by displaying a suggested default.
      </p>
      {users.length === 0 ? <p className="text-sm text-gray-500">No users to configure.</p> : (
        <>
          <label htmlFor="warehouse-permission-user" className="form-label">User</label>
          <select id="warehouse-permission-user" className="form-input mb-4"
            value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name} ({user.initials??'—'}) — {[user.admin_access?'Admin':'',user.office_access?'Office':'',user.technician_access?'Technician':''].filter(Boolean).join(' + ')||'No access'}{!user.is_active?' · Disabled':''}{user.van_number ? ' · ' + user.van_number : ''}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-600 mb-4 rounded border border-gray-200 p-3">{savedRow?'Warehouse settings previously saved.':'No warehouse-specific settings saved for this user. All optional warehouse actions are off until explicitly saved.'} Warehouse viewing is {effectiveView?'enabled':'disabled'} by the Office access setting.</div>
          <div className="space-y-3">
            {options.map(({ key, label, description }) => (
              <label key={key} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2">
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-gray-500">{description}</span>
                </span>
                <input type="checkbox" checked={key==='can_view'?effectiveView:permissions[key]}
                  onChange={(e) => setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                  disabled={isPending || key==='can_view'} aria-label={label} />
              </label>
            ))}
          </div>
          {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
          {message && <p role="status" className="text-sm text-green-700 mt-3">{message}</p>}
          <p className="text-xs text-gray-500 mt-3">Warehouse stock-changing operations require both the saved permission and applicable server/database authorisation. Use Users & Access to enable or disable Office access.</p>
          <button type="button" className="btn btn-primary mt-4"
            disabled={isPending || !userId} onClick={save}>
            {isPending ? 'Saving…' : 'Save permissions'}
          </button>
        </>
      )}
    </div>
  )
}
