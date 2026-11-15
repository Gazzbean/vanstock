import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
test('A11 only revoke trigger-only RPC grants; manager and disputed receipt guard still work',async t=>{
 const db=new PGlite()
 const manager=uid(10),company=uid(20),request=uid(30)
 try{
  await db.exec(await readFile(new URL('fixtures/a11-warehouse-trigger-pregrant.sql',import.meta.url),'utf8'))
  await db.query('insert into profiles values($1,$2,$3,$4)',[manager,company,'manager',true])
  await db.query('insert into manager_operation_permissions values($1,false,false,false)',[manager])
  await db.query('insert into warehouse_replenishment_requests values($1,$2,$3)',[request,company,'pending'])
  await db.query("select set_config('test.uid',$1,false)",[manager])
  const before=(await db.query(`select has_function_privilege('anon','public.vanstock_block_disputed_receipt()','EXECUTE') as anon_exec,
    has_function_privilege('authenticated','public.vanstock_enforce_manager_request_transition()','EXECUTE') as auth_exec`)).rows[0]
  assert.equal(before.anon_exec,true)
  assert.equal(before.auth_exec,true)
  await db.exec(await readFile(new URL('../supabase/migrations/20261115020000_a11_trigger_grants.sql',import.meta.url),'utf8'))
  const after=(await db.query(`select
    has_function_privilege('anon','public.vanstock_block_disputed_receipt()','EXECUTE') anon_block,
    has_function_privilege('authenticated','public.vanstock_block_disputed_receipt()','EXECUTE') auth_block,
    has_function_privilege('anon','public.vanstock_enforce_manager_request_transition()','EXECUTE') anon_manager,
    has_function_privilege('authenticated','public.vanstock_enforce_manager_request_transition()','EXECUTE') auth_manager,
    has_function_privilege('service_role','public.vanstock_block_disputed_receipt()','EXECUTE') service_block,
    has_function_privilege('service_role','public.vanstock_enforce_manager_request_transition()','EXECUTE') service_manager
    `)).rows[0]
  assert.deepEqual(after,{anon_block:false,auth_block:false,anon_manager:false,auth_manager:false,service_block:true,service_manager:true})
  await t.test('Manager cannot approve without independent grant',async()=>{
   await assert.rejects(db.query("update warehouse_replenishment_requests set status='approved' where id=$1",[request]),/Manager permission required to review/)
  })
  await t.test('manager grant still permits approval and issue, and denied issue fails',async()=>{
   await db.query('update manager_operation_permissions set approve_requests=true where user_id=$1',[manager])
   await db.query("update warehouse_replenishment_requests set status='approved' where id=$1",[request])
   await assert.rejects(db.query("update warehouse_replenishment_requests set status='issued' where id=$1",[request]),/Manager permission required to issue/)
   await db.query('update manager_operation_permissions set issue_warehouse=true where user_id=$1',[manager])
   await db.query("update warehouse_replenishment_requests set status='issued' where id=$1",[request])
  })
  await t.test('disputed receipt guard still fails closed after grants are restricted',async()=>{
   await db.query('insert into warehouse_receipt_discrepancies(request_id) values($1)',[request])
   await db.query('update manager_operation_permissions set confirm_van_receipt=true where user_id=$1',[manager])
   await assert.rejects(db.query("update warehouse_replenishment_requests set status='fulfilled' where id=$1",[request]),/Outstanding receipt discrepancy/)
   await db.query('update warehouse_receipt_discrepancies set resolved_at=now() where request_id=$1',[request])
   await db.query("update warehouse_replenishment_requests set status='fulfilled' where id=$1",[request])
   const row=(await db.query('select status from warehouse_replenishment_requests where id=$1',[request])).rows[0]
   assert.equal(row.status,'fulfilled')
  })
 }finally{await db.close()}
})
