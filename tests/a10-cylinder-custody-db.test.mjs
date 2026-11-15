import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import vm from 'node:vm'
import ts from 'typescript'

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const ids={company:id(10),other:id(20),supplier:id(30),otherSupplier:id(40),
 actor:id(50),warehouse:id(60),van:id(70)}
const migration=new URL('../supabase/migrations/20261115010000_a10_cylinder_custody.sql',import.meta.url)
const serialData={
  company_id:ids.company,cylinder_serial:'CYL-R134A-0001',
  gas_label:'R134a',nominal_capacity_kg:22,
  ownership:'supplier',supplier_id:ids.supplier,
  received_on:'2026-11-01',rent_free_until:'2027-02-01',
  return_due_on:'2027-04-01',rental_review_on:'2027-08-01',
  rental_terms_reference:'SUPPLIER-AGREEMENT-1',
  cylinder_test_due_on:'2027-03-01',last_leak_check_on:'2026-11-01',
  status:'in_custody',location_kind:'warehouse',
  warehouse_id:ids.warehouse,van_id:null,site_reference:null,
  notes:'Physical serial independently verified',audit_reference:'DOC-0001',
  created_by:ids.actor,updated_by:ids.actor
}

test('A10 cylinder register enforces company boundaries, serial uniqueness and immutable custody audit',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role;
   create table public.companies(id uuid primary key);
   create table public.profiles(id uuid primary key);
   create table public.suppliers(id uuid primary key,company_id uuid not null,unique(id,company_id));
   create table public.vans(id uuid primary key);
   create table public.warehouses(id uuid primary key);
  `)
  for(const c of [ids.company,ids.other])await db.query('insert into companies values($1)',[c])
  await db.query('insert into profiles values($1)',[ids.actor])
  await db.query('insert into warehouses values($1)',[ids.warehouse])
  await db.query('insert into vans values($1)',[ids.van])
  for(const [s,c] of [[ids.supplier,ids.company],[ids.otherSupplier,ids.other]])
   await db.query('insert into suppliers values($1,$2)',[s,c])
  await db.exec(await readFile(migration,'utf8'))

  const grant=(await db.query(`select
    has_table_privilege('anon','public.cylinder_custody','SELECT') anon_read,
    has_table_privilege('authenticated','public.cylinder_custody','INSERT') browser_write,
    has_table_privilege('authenticated','public.cylinder_custody_events','SELECT') browser_audit_read,
    has_table_privilege('service_role','public.cylinder_custody','UPDATE') service_write,
    (select relrowsecurity from pg_class where oid='public.cylinder_custody'::regclass) rls_active
   `)).rows[0]
  assert.deepEqual(grant,{anon_read:false,browser_write:false,browser_audit_read:false,service_write:true,rls_active:true})
  async function create(overrides={}){
   const fields={...serialData,...overrides}
   const columns=Object.keys(fields)
   const sql=`insert into public.cylinder_custody(${columns.join(',')}) values(${columns.map((_,i)=>'$'+(i+1)).join(',')}) returning id,version`
   const r=await db.query(sql,Object.values(fields))
   return r.rows[0]
  }
  const first=await create()
  await t.test('registration writes a serial-specific immutable event',async()=>{
   const r=(await db.query('select event_kind,audit_reference,actor_id,before_state,after_state from cylinder_custody_events')).rows[0]
   assert.equal(r.event_kind,'registered')
   assert.equal(r.audit_reference,'DOC-0001')
   assert.equal(r.actor_id,ids.actor)
   assert.equal(r.before_state,null)
   assert.equal(r.after_state.cylinder_serial,'CYL-R134A-0001')
  })
  await t.test('serial is unique ignoring whitespace and case within company',async()=>{
   await assert.rejects(create({cylinder_serial:' cyl-r134a-0001 '}),/duplicate key/)
  })
  await t.test('supplier must belong to same company, and hire dates need documented terms',async()=>{
   await assert.rejects(create({cylinder_serial:'CYL-2',supplier_id:ids.otherSupplier}),/foreign key/)
   await assert.rejects(create({cylinder_serial:'CYL-3',rental_terms_reference:null}),/cylinder_hire_dates_have_terms/)
   await assert.rejects(create({cylinder_serial:'CYL-4',rent_free_until:'2026-10-01'}),/cylinder_dates_valid/)
  })
  await t.test('returned cylinder has supplier location; cannot silently transfer stock via custody ledger',async()=>{
   await assert.rejects(create({cylinder_serial:'CYL-5',status:'returned',location_kind:'warehouse'}),/cylinder_status_location_valid/)
   await assert.rejects(create({cylinder_serial:'CYL-6',location_kind:'van',van_id:null,warehouse_id:null}),/cylinder_location_valid/)
   await assert.rejects(create({cylinder_serial:'CYL-7',location_kind:'unknown',warehouse_id:null}),/cylinder_status_location_valid/)
   const tables=(await db.query("select tablename from pg_tables where schemaname='public' and tablename like '%cylinder%' order by tablename")).rows
   assert.deepEqual(tables.map(x=>x.tablename),['cylinder_custody','cylinder_custody_events'])
  })
  await t.test('return changes custody version once and preserves full prior state',async()=>{
   const updated=await db.query(`update cylinder_custody set status='returned',
    location_kind='supplier',warehouse_id=null,van_id=null,site_reference=null,
    audit_reference='RETURN-0001',notes='Supplier receipt signed'
    where id=$1 and version=1 returning version`,[first.id])
   assert.equal(updated.rows[0].version,2)
   const events=(await db.query('select event_kind,before_state,after_state from cylinder_custody_events order by occurred_at,id')).rows
   assert.equal(events.length,2)
   const u=events.find(x=>x.event_kind==='updated')
   assert.equal(u.before_state.status,'in_custody')
   assert.equal(u.after_state.status,'returned')
   assert.equal(u.after_state.location_kind,'supplier')
   assert.equal(u.after_state.audit_reference,'RETURN-0001')
   const stale=(await db.query('update cylinder_custody set notes=$1 where id=$2 and version=1 returning id',['Stale overwrite',first.id])).rows
   assert.equal(stale.length,0)
  })
  await t.test('audit events and custody identities cannot be deleted or rewritten',async()=>{
   await assert.rejects(db.query('delete from cylinder_custody where id=$1',[first.id]),/Cylinder custody cannot be deleted/)
   await assert.rejects(db.query('update cylinder_custody_events set audit_reference=$1',['Fake']),/immutable/)
   await assert.rejects(db.query('delete from cylinder_custody_events'),/immutable/)
   await assert.rejects(db.query('update cylinder_custody set company_id=$1 where id=$2',[ids.other,first.id]),/ownership identity/)
  })
  await t.test('company-owned or recovery cylinder can have no rental terms',async()=>{
   const c=await create({
    cylinder_serial:'RECOVERY-22KG-1',gas_label:'Reclaimed refrigerant',
    ownership:'company',supplier_id:null,
    nominal_capacity_kg:22,rent_free_until:null,return_due_on:null,rental_review_on:null,
    rental_terms_reference:null,location_kind:'van',warehouse_id:null,van_id:ids.van,
    status:'in_custody',audit_reference:'OWN-001'
   })
   assert.equal(c.version,1)
  })
 }finally{await db.close()}
})

const lib=await readFile(new URL('../lib/cylinder-custody.ts',import.meta.url),'utf8')
const module={exports:{}}
vm.runInNewContext(ts.transpileModule(lib,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {module,exports:module.exports,Date,Number,String,Math,Array},{filename:'cylinder-custody.ts'})
const {validateCylinderInput,cylinderDueLabels}=module.exports
const form={
 cylinder_serial:'CYL-XX-01',gas_label:'R134a',nominal_capacity_kg:'12.00',
 ownership:'supplier',supplier_id:ids.supplier,
 received_on:'2026-11-01',rent_free_until:'',return_due_on:'',rental_review_on:'',rental_terms_reference:'',
 cylinder_test_due_on:'',last_leak_check_on:'',
 status:'in_custody',location_kind:'warehouse',
 warehouse_id:ids.warehouse,van_id:'',site_reference:'',notes:'',
 audit_reference:'RECEIPT-01'
}
test('A10 input validation requires known owner, supplier and explicit authorised location',()=>{
 assert.ok(validateCylinderInput(form).data)
 assert.match(validateCylinderInput({...form,cylinder_serial:'  '}).error,/serial/)
 assert.match(validateCylinderInput({...form,received_on:'2026-02-30'}).error,/receipt date/)
 assert.match(validateCylinderInput({...form,nominal_capacity_kg:'12.456'}).error,/Capacity/)
 assert.match(validateCylinderInput({...form,rent_free_until:'2027-04-01'}).error,/contract reference/)
 assert.match(validateCylinderInput({...form,ownership:'supplier',supplier_id:''}).error,/requires a supplier/)
 assert.match(validateCylinderInput({...form,location_kind:'van',warehouse_id:'',van_id:''}).error,/source van/)
 assert.match(validateCylinderInput({...form,status:'returned'}).error,/supplier destination/)
})
test('A10 rental reviews use only supplied actual terms; returned cylinders no longer warn',()=>{
 const row={status:'in_custody',rent_free_until:'2026-11-01',return_due_on:null,
 rental_review_on:'2026-11-10',cylinder_test_due_on:null}
 const due=cylinderDueLabels(row,'2026-11-15')
 assert.equal(due.length,2)
 assert.ok(due.every(x=>x.due))
 assert.equal(cylinderDueLabels({...row,status:'returned'},'2026-11-15').length,0)
 assert.equal(cylinderDueLabels({status:'in_custody'},'2026-11-15').length,0)
})
