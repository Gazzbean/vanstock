import assert from 'node:assert/strict'
import test from 'node:test'
import {buildFleetComparisonRows} from '../lib/fleet-comparison.ts'

test('fleet comparison sums each product across active vans only',()=>{
 const products=[{id:'p1',name:'Cable Ties',category:'Consumable',stock_unit:'ea'},
  {id:'p2',name:'Refrigerant',category:'Refrigerant',stock_unit:'kg'}]
 const vans=[{id:'v3'},{id:'v4'}]
 const rows=buildFleetComparisonRows(products,vans,[
  {van_id:'v3',product_id:'p1',quantity:10},
  {van_id:'v4',product_id:'p1',quantity:15},
  {van_id:'v3',product_id:'p2',quantity:1.25},
  {van_id:'archived',product_id:'p1',quantity:500},
 ])
 assert.equal(rows.length,2)
 assert.equal(rows[0].total,25)
 assert.deepEqual(rows[0].byVan,{v3:10,v4:15})
 assert.equal(rows[1].total,1.25)
 assert.equal(rows[1].byVan.v4,undefined)
})

test('fleet comparison ignores stale/non-finite records and never mixes product units',()=>{
 const rows=buildFleetComparisonRows(
  [{id:'p',name:'Hose',category:'Parts',stock_unit:'m'}],[{id:'v'}],
  [{van_id:'v',product_id:'p',quantity:2.5},{van_id:'v',product_id:'missing',quantity:99},
   {van_id:'v',product_id:'p',quantity:NaN}],
 )
 assert.equal(rows.length,1)
 assert.equal(rows[0].total,2.5)
})

test('fleet comparison preserves two-decimal stock accuracy',()=>{
 const [row]=buildFleetComparisonRows(
  [{id:'p',name:'Gas',category:'Refrigerant',stock_unit:'kg'}],[{id:'v3'},{id:'v4'}],
  [{van_id:'v3',product_id:'p',quantity:0.1},{van_id:'v3',product_id:'p',quantity:0.2},
   {van_id:'v4',product_id:'p',quantity:0.3}],
 )
 assert.equal(row.byVan.v3,0.3)
 assert.equal(row.total,0.6)
})
