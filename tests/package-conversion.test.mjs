import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidPackageConversion } from '../lib/package-conversion.ts'

test('500 individual cable ties per purchased pack is valid', () => {
  assert.equal(isValidPackageConversion(500, 'ea'), true)
})

test('a package must contain a positive explicit quantity', () => {
  for (const value of [0, -1, NaN, Infinity, 1_000_000_000]) {
    assert.equal(isValidPackageConversion(value, 'ea'), false)
  }
})

test('individually counted stock cannot have fractional package contents', () => {
  assert.equal(isValidPackageConversion(2.5, 'ea'), false)
  assert.equal(isValidPackageConversion(1.5, 'pack'), false)
})

test('measured stock may have up to two decimal places per purchase unit', () => {
  assert.equal(isValidPackageConversion(12.25, 'kg'), true)
  assert.equal(isValidPackageConversion(25.5, 'm'), true)
  assert.equal(isValidPackageConversion(1.005, 'm'), false)
})
