// ============================================================
// types/index.ts
// All the data shapes used across the app.
// Think of these as "blueprints" — they describe exactly what
// fields every piece of data must have.
// ============================================================

export type Role = 'technician' | 'manager' | 'admin'

export type TransferType = 'issue' | 'return' | 'van-to-van' | 'depot' | 'adjust'

export interface Company {
  id: string
  name: string
  created_at: string
}

export interface Van {
  id: string
  company_id: string
  van_number: string
  created_at: string
}

export interface Profile {
  id: string
  company_id: string
  van_id: string | null
  full_name: string
  role: Role
  created_at: string
  // joined fields
  van?: Van
}

export interface Product {
  id: string
  company_id: string
  name: string
  category: string
  min_stock: number
  created_at: string
}

export interface StockItem {
  id: string
  van_id: string
  product_id: string
  quantity: number
  updated_at: string
  // joined fields
  product?: Product
}

export interface ActivityLog {
  id: string
  company_id: string
  van_id: string | null
  user_id: string | null
  product_id: string | null
  product_name: string
  type: TransferType
  quantity: number
  reference: string | null
  notes: string | null
  created_at: string
  // joined fields
  profile?: Pick<Profile, 'full_name'>
  van?: Pick<Van, 'van_number'>
}

// What we need to create a new transfer
export interface TransferPayload {
  type: TransferType
  product_id: string
  quantity: number
  reference: string
  notes?: string
}

// What we need to adjust stock directly
export interface AdjustPayload {
  product_id: string
  action: 'add' | 'remove' | 'set'
  quantity: number
  reason: string
}

// Summary stats shown on the dashboard
export interface DashboardStats {
  totalItems: number
  lowStockCount: number
  transfersToday: number
  issuedToday: number
}
