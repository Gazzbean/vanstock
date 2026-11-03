import test from 'node:test'
import assert from 'node:assert/strict'
import {perthDayStartUtc,countTodayStockActivity} from '../lib/dashboard-activity.ts'

test('Perth reporting day starts at 16:00 UTC on the previous calendar date',()=>{
  assert.equal(perthDayStartUtc(new Date('2026-11-03T01:00:00Z')),'2026-11-02T16:00:00.000Z')
  assert.equal(perthDayStartUtc(new Date('2026-11-02T15:59:59Z')),'2026-11-01T16:00:00.000Z')
  assert.equal(perthDayStartUtc(new Date('2026-11-02T16:00:00Z')),'2026-11-02T16:00:00.000Z')
})

test('transfer metric counts stock movements only, not adjustments or issues',()=>{
  assert.deepEqual(countTodayStockActivity([
    {type:'issue'},{type:'adjust'},{type:'warehouse-adjust'},{type:'receipt-pack'},
    {type:'warehouse-to-van'},{type:'van-to-warehouse'},{type:'van-to-van'},{type:'issue'},
  ]),{transfersToday:3,issuedToday:2})
})
