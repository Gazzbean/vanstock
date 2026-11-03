import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStockDisplayRows, hasReachedMinimum } from '../lib/stock-standards.ts'

const ties = { id: 'ties', name: 'TEST – Cable Ties 500pk', category: 'Consumable', stock_unit: 'ea', min_stock: 2 }
const mandatory = { product_id: 'ties', classification: 'mandatory', min_quantity: 50, target_quantity: 500 }
const entry = quantity => [{ id: 'balance', product_id: 'ties', quantity, product: ties }]

test('van minimum 50 overrides product-wide minimum 2', () => {
  assert.equal(buildStockDisplayRows([ties], entry(20), [mandatory])[0].status, 'Low')
  assert.equal(buildStockDisplayRows([ties], entry(50), [mandatory])[0].status, 'Low')
  assert.equal(buildStockDisplayRows([ties], entry(51), [mandatory])[0].status, 'OK')
  assert.equal(buildStockDisplayRows([ties], entry(480), [mandatory])[0].status, 'OK')
  assert.equal(buildStockDisplayRows([ties], entry(500), [mandatory])[0].status, 'Full')
})

test('replenishment threshold includes the minimum and ignores a zero threshold', () => {
  assert.equal(hasReachedMinimum(50, 50), true)
  assert.equal(hasReachedMinimum(51, 50), false)
  assert.equal(hasReachedMinimum(0, 0), false)
})

test('missing mandatory product appears as critical with quantity zero', () => {
  const [row] = buildStockDisplayRows([ties], [], [mandatory])
  assert.equal(row.quantity, 0)
  assert.equal(row.status, 'Critical')
  assert.equal(row.minimum, 50)
})

test('unconfigured stocked item retains its catalogue minimum', () => {
  const [row] = buildStockDisplayRows([ties], entry(1), [])
  assert.equal(row.minimum, 2)
  assert.equal(row.status, 'Low')
})

test('optional item does not trigger a shortage', () => {
  const [row] = buildStockDisplayRows([ties], entry(1), [{ ...mandatory, classification: 'optional', min_quantity: 0, target_quantity: 0 }])
  assert.equal(row.status, 'Optional')
})
