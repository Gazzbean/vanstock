import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

test('A03 app uses available stock and shows recorded, committed, available separately',async()=>{
 const actions=await readFile(new URL('../lib/actions.ts',import.meta.url),'utf8')
 const page=await readFile(new URL('../app/warehouse/page.tsx',import.meta.url),'utf8')
 const q=await readFile(new URL('../components/WarehouseRequestQueue.tsx',import.meta.url),'utf8')
 assert.match(actions,/committed_quantity/)
 assert.match(actions,/Number\(row.quantity\)-Number\(row.committed_quantity\)/)
 assert.match(page,/Committed<\/th>/)
 assert.match(page,/Available<\/th>/)
 assert.match(page,/quantity:i.available_quantity/)
 assert.match(q,/Quantity is committed and unavailable for another issue/)
})
