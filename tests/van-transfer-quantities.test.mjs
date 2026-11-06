import assert from 'node:assert/strict'
import test from 'node:test'
import {transferStockUnits} from '../lib/van-transfer-quantities.ts'

test('one full pack of 500 cable ties transfers 500 ea',()=>{
 assert.equal(transferStockUnits('pack',1,500,'ea'),500)
 assert.equal(transferStockUnits('pack',2,500,'ea'),1000)
})
test('ten loose cable ties transfer ten ea without pack multiplication',()=>{
 assert.equal(transferStockUnits('loose',10,null,'ea'),10)
})
test('invalid conversions and fractional whole-stock quantities are rejected',()=>{
 assert.equal(transferStockUnits('pack',1,null,'ea'),0)
 assert.equal(transferStockUnits('pack',1.5,500,'ea'),0)
 assert.equal(transferStockUnits('pack',1,2.5,'ea'),0)
 assert.equal(transferStockUnits('loose',1.5,null,'ea'),0)
 assert.equal(transferStockUnits('loose',1.25,null,'kg'),1.25)
})
