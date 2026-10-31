// Offline checks: no database access, API keys or remote operations.
// Run with: node scripts/check-warehouse-stage.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
const check = (name, fn) => {
  try { fn(); console.log('PASS', name); return true }
  catch (err) { console.error('FAIL', name, err.message); return false }
}
const checks = []
const add = (name, fn) => checks.push([name, fn])

add('warehouse stores two-decimal balances', () => {
  const sql = read('supabase/migrations/20261030_warehouse_inventory_stage.sql')
  assert.ok(sql.includes('quantity numeric(12,2)'))
  assert.ok(sql.includes('alter column quantity type numeric(12,2)'))
  assert.ok(!sql.includes('numeric(12,3)'))
})
add('transaction functions validate precision before storage', () => {
  for (const [path, arg] of [
    ['supabase/migrations/20261030_warehouse_inventory_stage.sql', 'p_quantity'],
    ['supabase/migrations/20261030_atomic_van_actions_stage.sql', 'p_quantity'],
    ['supabase/migrations/20261030_warehouse_opening_stock_stage.sql', 'p_count'],
  ]) {
    const sql = read(path)
    assert.ok(sql.includes(arg + ' numeric,'), path + ' parameter must be unscaled')
    assert.ok(sql.includes('trunc(' + arg + ', 2)'), path + ' must check two decimals')
    assert.ok(sql.includes('Maximum two decimal places permitted'), path)
  }
})
add('integrity constraints are staged', () => {
  const sql = read('supabase/migrations/20261030_stock_integrity_constraints_stage.sql')
  for (const name of ['stock_quantity_nonnegative', 'products_min_stock_nonnegative', 'activity_log_quantity_nonnegative'])
    assert.ok(sql.includes(name), name)
})
add('direct stock writes locked down', () => {
  const sql = read('supabase/migrations/20261030_stock_write_lockdown_stage.sql')
  for (const table of ['stock','activity_log','warehouse_stock'])
    assert.ok(sql.includes('revoke insert, update, delete on table public.' + table), table)
})
add('warehouse movement has one ledger entry', () => {
  const sql = read('supabase/migrations/20261030_warehouse_inventory_stage.sql')
  const section = sql.split('-- ONE movement = ONE audit event.')[1]
  assert.ok(section && section.includes('insert into public.activity_log'))
  assert.ok(!section.includes('Warehouse ledger entry.'))
})
add('product archive does not delete records', () => {
  const sql = read('supabase/migrations/20261030_product_archive_stage.sql')
  assert.ok(sql.includes('set_product_archived'))
  assert.ok(sql.includes('quantity <> 0'))
  assert.ok(!sql.toLowerCase().includes('delete from public.products'))
})
add('forms use hundredths rather than thousandths', () => {
  for (const path of [
    'components/TransferForm.tsx',
    'components/AdjustStockModal.tsx',
    'components/AddProductModal.tsx',
    'components/WarehouseReplenishmentDraft.tsx',
    'components/WarehouseOpeningStockForm.tsx',
  ]) {
    const tsx = read(path)
    assert.ok(!tsx.includes('0.001'), path)
    assert.ok(tsx.includes('0.01') || tsx.includes('1,2'), path)
  }
})
add('technician without van sees no activity log', () => {
  const src = read('lib/actions.ts')
  const segment = src.split('export async function getActivityLog(')[1]?.split('// ── PRODUCTS')[0]
  assert.ok(segment && segment.includes("if (profile.role === 'technician')"))
  assert.ok(segment.includes('if (!profile.van_id) return []'))
})

const passed = checks.filter(([name, fn]) => check(name, fn)).length
console.log(passed + '/' + checks.length + ' static checks passed')
if (passed !== checks.length) process.exitCode = 1
