import test from 'node:test'
import assert from 'node:assert/strict'
import {createHarness,button,byId,change,textOf} from './helpers/component-interaction-harness.mjs'

test('Warehouse request shows amber readiness only after valid inputs, without writing stock',async()=>{
 let writes=0
 const h=await createHarness('components/WarehouseRequestForm.tsx',{
  requestWarehouseReplenishment:async()=>{writes++;return {success:true}}
 })
 const props={
  warehouses:[{id:'w',name:'Main'}],
  vans:[{id:'v',van_number:'Van 1'}],
  products:[{id:'p',name:'Cable tie',unit:'ea'}],
  selectedVanId:null,balances:[{warehouse_id:'w',product_id:'p',quantity:10}],packages:[]
 }
 let tree=h.render(props)
 assert.equal(button(tree,'Submit request').props.disabled,true)
 assert.doesNotMatch(tree.props.className,/border-amber-500/)
 button(tree,'Individual or loose items').props.onClick()
 change(tree,'request-van','v')
 change(tree,'request-product','p')
 change(tree,'request-reference','REQ-1')
 tree=h.render(props)
 assert.match(tree.props.className,/border-amber-500/)
 assert.match(textOf(tree),/Ready to submit — review replenishment request/)
 assert.equal(writes,0,'ready state must not submit the request automatically')
})
