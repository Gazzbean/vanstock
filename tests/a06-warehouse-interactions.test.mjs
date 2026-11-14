import test from 'node:test'
import assert from 'node:assert/strict'
import {createHarness,byId,button,nodes,textOf,change,deferred} from './helpers/component-interaction-harness.mjs'

const warehouses=[{id:'w1',name:'Main Warehouse'}]
const vans=[{id:'v1',van_number:'Van 1'},{id:'v2',van_number:'Van 2'}]
const products=[{id:'p1',name:'Cable ties',unit:'ea'}]

test('A06 Van return: disabled renders no controls, enabled requires explicit source/destination, amber then green',async()=>{
 let calls=0
 const receipt=deferred()
 const mock={returnVanStockToWarehouse:async(...args)=>{calls++;assert.deepEqual(Array.from(args),['w1','v2','p1',2,'JOB-123']);return receipt.promise}}
 const h=await createHarness('components/TechnicianWarehouseMovement.tsx',mock)
 const props={warehouses,vans,products,enabled:false}
 let tree=h.render(props)
 assert.match(textOf(tree),/Warehouse stock movements unavailable/)
 assert.equal(nodes(tree).some(x=>x.type==='select'||x.type==='input'),false)
 tree=h.render({...props,enabled:true})
 assert.equal(byId(tree,'return-source-van').props.value,'')
 assert.equal(byId(tree,'return-destination-warehouse').props.value,'')
 assert.equal(button(tree,'Confirm warehouse return').props.disabled,true)
 change(tree,'return-source-van','v2')
 change(tree,'return-destination-warehouse','w1')
 change(tree,'return-product','p1')
 change(tree,'return-quantity','2')
 change(tree,'return-reason','JOB-123')
 tree=h.render({...props,enabled:true})
 assert.match(tree.props.className,/border-amber-500/)
 assert.match(textOf(tree),/Ready to confirm — review return/)
 assert.match(textOf(tree),/Van 2\s*→\s*Main Warehouse\s*:\s*2\s+ea/)
 assert.equal(button(tree,'Confirm warehouse return').props.disabled,false)
 const submit=button(tree,'Confirm warehouse return')
 submit.props.onClick()
 submit.props.onClick()
 tree=h.render({...props,enabled:true})
 assert.match(tree.props.className,/border-amber-500/)
 await Promise.resolve()
 assert.equal(calls,1,'rapid double click must cause exactly one warehouse RPC')
 receipt.resolve({success:true})
 await h.flush()
 tree=h.render({...props,enabled:true})
 assert.match(tree.props.className,/border-green-600/)
 assert.match(textOf(tree),/Return recorded/)
 assert.equal(button(tree,'Return recorded').props.disabled,true)
 assert.equal(h.refreshCount,1)
})

test('A06 Van return: server failure is red and corrected input allows one retry',async()=>{
 let calls=0
 const h=await createHarness('components/TechnicianWarehouseMovement.tsx',{
   returnVanStockToWarehouse:async()=>++calls===1?{error:'Insufficient van stock'}:{success:true}
 })
 const props={warehouses,vans,products,enabled:true}
 let tree=h.render(props)
 for(const [id,value] of [
  ['return-source-van','v1'],['return-destination-warehouse','w1'],
  ['return-product','p1'],['return-reason','TEST-FAIL']
 ])change(tree,id,value)
 tree=h.render(props)
 button(tree,'Confirm warehouse return').props.onClick()
 await h.flush()
 tree=h.render(props)
 assert.match(tree.props.className,/border-red-500/)
 assert.match(textOf(tree),/Insufficient van stock/)
 change(tree,'return-reason','TEST-RETRY')
 tree=h.render(props)
 assert.match(tree.props.className,/border-amber-500/)
 button(tree,'Confirm warehouse return').props.onClick()
 await h.flush()
 tree=h.render(props)
 assert.match(tree.props.className,/border-green-600/)
 assert.equal(calls,2)
})

test('A06 replenishment: ready only after required inputs, amber ready, double-submit locked, green success',async()=>{
 let calls=0
 const saved=deferred()
 const props={warehouses,products,vans,selectedVanId:null,balances:[{warehouse_id:'w1',product_id:'p1',quantity:5}]}
 const h=await createHarness('components/WarehouseRequestForm.tsx',{
  requestWarehouseReplenishment:async(...args)=>{calls++;assert.deepEqual(Array.from(args),['w1','v2','p1',3,'MGR-001']);return saved.promise}
 })
 let tree=h.render(props)
 assert.equal(byId(tree,'request-van').props.value,'')
 assert.equal(button(tree,'Submit request').props.disabled,true)
 button(tree,'Individual or loose items').props.onClick()
 change(tree,'request-van','v2')
 change(tree,'request-product','p1')
 change(tree,'request-qty','3')
 change(tree,'request-reference','MGR-001')
 tree=h.render(props)
 assert.match(tree.props.className,/border-amber-500/)
 assert.match(textOf(tree),/Ready to submit — review replenishment request/)
 const submit=button(tree,'Submit request')
 submit.props.onClick()
 submit.props.onClick()
 await Promise.resolve()
 assert.equal(calls,1)
 saved.resolve({success:true})
 await h.flush()
 tree=h.render(props)
 assert.match(tree.props.className,/border-green-600/)
 assert.equal(button(tree,'Request submitted').props.disabled,true)
 assert.equal(h.refreshCount,1)
})

test('A06 replenishment: validation shortage is visible; server error is red; correction restores ready',async()=>{
 let calls=0
 const props={warehouses,products,vans,selectedVanId:null,balances:[{warehouse_id:'w1',product_id:'p1',quantity:0}]}
 const h=await createHarness('components/WarehouseRequestForm.tsx',{
   requestWarehouseReplenishment:async()=>++calls===1?{error:'Server refused request'}:{success:true}
 })
 let tree=h.render(props)
 button(tree,'Individual or loose items').props.onClick()
 change(tree,'request-van','v1')
 change(tree,'request-product','p1')
 change(tree,'request-reference','TEST-ERR')
 tree=h.render(props)
 assert.match(textOf(tree),/Not enough warehouse stock/)
 assert.match(tree.props.className,/border-amber-500/)
 button(tree,'Submit request').props.onClick()
 await h.flush()
 tree=h.render(props)
 assert.match(tree.props.className,/border-red-500/)
 assert.match(textOf(tree),/Server refused request/)
 change(tree,'request-reference','TEST-RETRY')
 tree=h.render(props)
 assert.match(tree.props.className,/border-amber-500/)
 button(tree,'Submit request').props.onClick()
 await h.flush()
 assert.match(h.render(props).props.className,/border-green-600/)
 assert.equal(calls,2)
})

test('A06 warehouse correction: disabled has no entry fields, ready amber, single posting then green',async()=>{
 let calls=0
 const saved=deferred()
 const props={warehouses,products,balances:[{warehouse_id:'w1',product_id:'p1',quantity:12,committed_quantity:2}],enabled:false,canAdjust:true,canStocktake:false}
 const h=await createHarness('components/WarehouseCorrections.tsx',{
  adjustWarehouseStock:async(...args)=>{calls++;assert.deepEqual(Array.from(args),['w1','p1','remove',3,'COUNT-OK']);return saved.promise}
 })
 let tree=h.render(props)
 assert.match(textOf(tree),/Warehouse adjustments unavailable/)
 assert.equal(nodes(tree).some(x=>x.type==='input'||x.type==='select'),false)
 tree=h.render({...props,enabled:true})
 change(tree,'correction-wh','w1')
 change(tree,'adjust-op','remove')
 change(tree,'correction-product','p1')
 change(tree,'correction-qty','3')
 change(tree,'correction-ref','COUNT-OK')
 tree=h.render({...props,enabled:true})
 assert.match(tree.props.className,/border-amber-500/)
 const submit=button(tree,'Record adjustment')
 submit.props.onClick();submit.props.onClick()
 await Promise.resolve()
 assert.equal(calls,1)
 saved.resolve({success:true})
 await h.flush()
 tree=h.render({...props,enabled:true})
 assert.match(tree.props.className,/border-green-600/)
 assert.equal(button(tree,'Correction recorded').props.disabled,true)
})

test('A06 request queue: rapid duplicate approval is ignored; status and audit feedback update once',async()=>{
 let calls=0
 const saved=deferred()
 const pendingRequest={
 id:'q1',warehouse_id:'w1',van_id:'v1',product_id:'p1',quantity:1,reference:'REF-Q1',
 status:'pending',created_at:'2026-11-14T03:00:00Z',
 requested_by_label:'Technician',reviewed_by_label:'—',reviewed_at:null,
 rejection_reason:null,fulfilled_by_label:'—',issued_by_label:'—',
 received_by_label:'—',discrepancy:null
 }
 const props={requests:[pendingRequest],warehouses,vans,products,canManage:true,canApprove:true,canIssue:true,canReceive:false,writesEnabled:true,balances:[]}
 const h=await createHarness('components/WarehouseRequestQueue.tsx',{
  processWarehouseRequest:async(id,action)=>{calls++;assert.equal(id,'q1');assert.equal(action,'approve');return saved.promise}
 })
 let tree=h.render(props)
 const approve=button(tree,'Approve')
 approve.props.onClick();approve.props.onClick()
 await Promise.resolve()
 assert.equal(calls,1)
 saved.resolve({success:true})
 await h.flush()
 tree=h.render(props)
 assert.match(textOf(tree),/Request approved. No stock has moved/)
 assert.equal(nodes(tree).filter(x=>x.type==='button'&&textOf(x)==='Approve').length,0)
 assert.equal(h.refreshCount,1)
})


test('A06 van receipt queue: amber review, one confirmed receiving action, success feedback',async()=>{
 let calls=0
 const saved=deferred()
 const request={
  id:'q2',warehouse_id:'w1',van_id:'v1',product_id:'p1',quantity:2,reference:'REF-ISSUED',
  status:'issued',created_at:'2026-11-14T03:00:00Z',
  requested_by_label:'Technician',reviewed_by_label:'Manager',reviewed_at:'2026-11-14T04:00:00Z',
  rejection_reason:null,fulfilled_by_label:'—',issued_by_label:'Warehouse',
  received_by_label:'—',discrepancy:null
 }
 const props={requests:[request],warehouses,vans,products,canManage:true,canApprove:true,
  canIssue:true,canReceive:true,writesEnabled:true,balances:[]}
 const h=await createHarness('components/WarehouseRequestQueue.tsx',{
  confirmWarehouseReceipt:async id=>{calls++;assert.equal(id,'q2');return saved.promise}
 })
 let tree=h.render(props)
 button(tree,'Review receiving confirmation').props.onClick()
 tree=h.render(props)
 assert.match(textOf(tree),/Confirm 2 ea received into Van 1/)
 assert.ok(nodes(tree).some(x=>typeof x.props?.className==='string'&&x.props.className.includes('border-amber-500')))
 const confirm=button(tree,'Confirm received & move stock')
 confirm.props.onClick();confirm.props.onClick()
 await Promise.resolve()
 assert.equal(calls,1)
 saved.resolve({success:true})
 await h.flush()
 tree=h.render(props)
 assert.match(textOf(tree),/Receipt confirmed. Warehouse and van balances have been updated/)
 assert.equal(nodes(tree).filter(x=>x.type==='button'&&textOf(x)==='Confirm received & move stock').length,0)
 assert.equal(h.refreshCount,1)
})

test('A06 opening stock: amber count ready, synchronous double-submit guard and green completion',async()=>{
 let calls=0
 const saved=deferred()
 const props={warehouses,products,balances:[],enabled:true}
 const h=await createHarness('components/WarehouseOpeningStockForm.tsx',{
  postWarehouseOpeningStock:async(...args)=>{calls++;assert.deepEqual(Array.from(args),['w1','p1',8,'STK-001']);return saved.promise}
 })
 let tree=h.render({...props,enabled:false})
 assert.equal(button(tree,'Opening stock posting — not yet enabled').props.disabled,true)
 tree=h.render(props)
 assert.equal(button(tree,'Post opening stock').props.disabled,true)
 change(tree,'opening-warehouse','w1')
 change(tree,'opening-product','p1')
 change(tree,'opening-count','8')
 change(tree,'opening-reference','STK-001')
 tree=h.render(props)
 assert.match(tree.props.className,/border-amber-500/)
 const submit=button(tree,'Post opening stock')
 submit.props.onClick();submit.props.onClick()
 await Promise.resolve()
 assert.equal(calls,1)
 saved.resolve({success:true})
 await h.flush()
 tree=h.render(props)
 assert.match(tree.props.className,/border-green-600/)
 assert.match(textOf(tree),/Opening stock posted/)
 assert.equal(button(tree,'Opening stock recorded').props.disabled,true)
})
