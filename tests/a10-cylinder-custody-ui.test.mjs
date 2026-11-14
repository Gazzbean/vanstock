import test from 'node:test'
import assert from 'node:assert/strict'
import {createHarness,nodes,textOf,button,deferred} from './helpers/component-interaction-harness.mjs'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const props={records:[],events:[],
 suppliers:[{id:id(100),name:'Supplier A',active:true}],
 warehouses:[{id:id(200),name:'Main Warehouse'}],
 vans:[{id:id(300),van_number:'Van 1',active:true}],
 canEdit:true,perthDay:'2026-11-15'}

function input(tree,placeholder){
 const found=nodes(tree).find(x=>x.type==='input'&&x.props.placeholder===placeholder)
 assert.ok(found,'Missing input '+placeholder)
 return found
}
function select(tree,marker){
 const found=nodes(tree).find(x=>x.type==='select'&&textOf(x).includes(marker))
 assert.ok(found,'Missing selection '+marker)
 return found
}
const choose=(element,value)=>element.props.onChange({target:{value}})
const readySection=tree=>nodes(tree).find(x=>x.type==='section'&&
 typeof x.props?.className==='string'&&x.props.className.includes('border-2'))
const saveButton=tree=>nodes(tree).find(x=>x.type==='button'&&
 x.props?.disabled!==undefined&&textOf(x)==='Register cylinder')

test('A10 register: explicit physical identity, supplier evidence and location before an audited submit',async()=>{
 const saved=deferred()
 let calls=0
 const h=await createHarness('components/CylinderCustodyRegister.tsx',{
  saveCylinderCustody:async data=>{
   calls++
   assert.equal(data.cylinder_serial,'CYL-1234')
   assert.equal(data.gas_label,'R134a')
   assert.equal(data.supplier_id,id(100))
   assert.equal(data.warehouse_id,id(200))
   assert.equal(data.audit_reference,'SUP-REC-123')
   return saved.promise
  }
 })
 let tree=h.render(props)
 assert.match(textOf(tree),/This does not mean the warehouse or vans are physically empty/)
 button(tree,'Register cylinder').props.onClick()
 tree=h.render(props)
 assert.equal(saveButton(tree).props.disabled,true)
 choose(input(tree,'Stamped serial number'),'CYL-1234')
 choose(input(tree,'e.g. R134a or Oxygen'),'R134a')
 choose(select(tree,'Select ownership'),'supplier')
 choose(select(tree,'Select supplier'),''+id(100))
 choose(select(tree,'Select location type'),'warehouse')
 tree=h.render(props)
 choose(select(tree,'Select warehouse'),id(200))
 const received=nodes(tree).find(x=>x.type==='input'&&x.props.type==='date')
 assert.ok(received)
 choose(received,'2026-11-15')
 choose(input(tree,'Required for every registration and custody change'),'SUP-REC-123')
 tree=h.render(props)
 assert.equal(saveButton(tree).props.disabled,false)
 assert.match(readySection(tree).props.className,/border-amber-500/)
 assert.match(textOf(tree),/does not change refrigerant kg, warehouse stock, van stock or supplier billing/)
 const submit=saveButton(tree)
 submit.props.onClick();submit.props.onClick()
 await Promise.resolve()
 assert.equal(calls,1)
 saved.resolve({success:true})
 await h.flush()
 tree=h.render(props)
 assert.match(readySection(tree).props.className,/border-green-600/)
 assert.equal(button(tree,'Custody recorded').props.disabled,true)
 assert.match(textOf(tree),/Cylinder registered\. Verify the physical serial and location/)
 assert.equal(h.refreshCount,1)
})

test('A10: Technician/Office views remain read-only without a registration or edit control',async()=>{
 const row={
  id:id(555),cylinder_serial:'CYL-1',gas_label:'Refrigerant',
  nominal_capacity_kg:22,ownership:'supplier',supplier_id:id(100),
  received_on:'2026-11-01',rent_free_until:'2026-11-10',return_due_on:null,
  rental_review_on:null,rental_terms_reference:'Supplier agreement',cylinder_test_due_on:null,
  last_leak_check_on:null,status:'in_custody',location_kind:'warehouse',
  warehouse_id:id(200),van_id:null,site_reference:null,
  notes:null,audit_reference:'RECEIPT-01',version:1,updated_at:'2026-11-01T00:00:00Z'
 }
 const h=await createHarness('components/CylinderCustodyRegister.tsx',{})
 const tree=h.render({...props,records:[row],canEdit:false})
 assert.match(textOf(tree),/CYL-1/)
 assert.match(textOf(tree),/Rent-free period expired/)
 assert.ok(!nodes(tree).some(x=>x.type==='button'&&['Register cylinder','Edit / transfer'].includes(textOf(x))))
})

test('A10: no false supplier deadline when supplier terms are absent',async()=>{
 const row={
  id:id(555),cylinder_serial:'COMPANY-RECOVERY-1',gas_label:'Reclaimed refrigerant',
  nominal_capacity_kg:65,ownership:'company',supplier_id:null,
  received_on:'2026-11-01',rent_free_until:null,return_due_on:null,
  rental_review_on:null,rental_terms_reference:null,cylinder_test_due_on:null,
  last_leak_check_on:null,status:'in_custody',location_kind:'warehouse',
  warehouse_id:id(200),van_id:null,site_reference:null,
  notes:null,audit_reference:'OWN-001',version:1,updated_at:'2026-11-01T00:00:00Z'
 }
 const h=await createHarness('components/CylinderCustodyRegister.tsx',{})
 const tree=h.render({...props,records:[row],canEdit:false})
 assert.match(textOf(tree),/No due dates recorded/)
 assert.doesNotMatch(textOf(tree),/Rent-free period expired/)
})
