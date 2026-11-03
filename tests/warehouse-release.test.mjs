import test from 'node:test'
import assert from 'node:assert/strict'
import {warehouseWritesEnabled} from '../lib/warehouse-release.ts'

test('warehouse writes fail closed when release setting is absent or incorrect',()=>{
  for(const value of [undefined,'','false','TRUE','yes','1',' true ']){
    assert.equal(warehouseWritesEnabled(value),false,`Unexpected enable for ${value}`)
  }
  assert.equal(warehouseWritesEnabled('true'),true)
})
