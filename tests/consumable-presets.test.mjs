import test from 'node:test'
import assert from 'node:assert/strict'
import { validQuickUseOptions } from '../lib/consumable-presets.ts'

test('counted consumables accept four increasing whole-number options', () => {
  assert.equal(validQuickUseOptions([5, 10, 20, 50], 'ea'), true)
  assert.equal(validQuickUseOptions([1, 2, 5, 10], 'pack'), true)
})

test('fractional quick-use quantities are rejected for individually counted products', () => {
  assert.equal(validQuickUseOptions([0.5, 5, 10, 20], 'ea'), false)
  assert.equal(validQuickUseOptions([1, 2, 3.5, 4], 'container'), false)
})

test('metres and kilograms allow no more than two decimal places', () => {
  assert.equal(validQuickUseOptions([0.25, 0.5, 1.25, 2], 'm'), true)
  assert.equal(validQuickUseOptions([0.1, 0.25, 0.5, 1], 'kg'), true)
  assert.equal(validQuickUseOptions([0.001, 0.5, 1, 2], 'kg'), false)
})

test('all groups require four positive, strictly increasing, bounded options', () => {
  assert.equal(validQuickUseOptions([5, 10, 20], 'ea'), false)
  assert.equal(validQuickUseOptions([5, 10, 10, 20], 'ea'), false)
  assert.equal(validQuickUseOptions([0, 1, 2, 3], 'ea'), false)
  assert.equal(validQuickUseOptions([5, 10, 20, 1_000_000_000], 'ea'), false)
})
