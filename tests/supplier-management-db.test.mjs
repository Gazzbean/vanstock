import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261105150000_supplier_management.sql',import.meta.url)
const company='00000000-0000-4000-8000-000000000001'
const admin='00000000-0000-4000-8000-000000000002'
const supplier='00000000-0000-4000-8000-000000000003'
const option='00000000-0000-4000-8000-000000000004'
const unusedOption='00000000-0000-4000-8000-000000000005'

test('supplier management audits edits and prevents deletion of historical receipts',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create role anon; create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table companies(id uuid primary key);
   create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
   create table suppliers(id uuid primary key,company_id uuid references companies(id),name text,active boolean);
   create table supplier_product_options(id uuid primary key,company_id uuid,supplier_id uuid references suppliers(id),units_per_package numeric);
   create table pack_receipts(id uuid primary key,supplier_id uuid references suppliers(id),supplier_option_id uuid references supplier_product_options(id),units_per_package numeric,stock_quantity numeric);
   create table loose_item_receipts(id uuid primary key,supplier_id uuid references suppliers(id));
  `)
  await db.query('insert into companies values ($1)',[company])
  await db.query("insert into profiles values($1,$2,'admin',true)",[admin,company])
  await db.query('insert into suppliers values ($1,$2,$3,true)',[supplier,company,'Test supplier'])
  await db.query('insert into supplier_product_options values($1,$3,$4,1),($2,$3,$4,500)',[option,unusedOption,company,supplier])
  await db.query('insert into pack_receipts values($1,$2,$3,1,1)', ['00000000-0000-4000-8000-000000000006',supplier,option])
  await db.exec(await readFile(migration,'utf8'))
  await db.query("select set_config('test.user_id',$1,false)",[admin])
  await db.query('update supplier_product_options set units_per_package=500 where id=$1',[option])
  assert.equal(Number((await db.query('select stock_quantity from pack_receipts')).rows[0].stock_quantity),1)
  const audit=(await db.query("select before_values->>'units_per_package' as old_value,after_values->>'units_per_package' as new_value from supplier_configuration_audit where entity_type='package'")).rows
  assert.deepEqual(audit,[{old_value:'1',new_value:'500'}])
  await assert.rejects(db.query("select vanstock_delete_unused_supplier_record('package',$1)",[option]),/historical receipts/)
  assert.equal((await db.query("select vanstock_delete_unused_supplier_record('package',$1) as deleted",[unusedOption])).rows[0].deleted,true)
  await assert.rejects(db.query("select vanstock_delete_unused_supplier_record('supplier',$1)",[supplier]),/linked packages or receipts/)
  await db.query("select set_config('test.user_id','00000000-0000-4000-8000-000000000099',false)")
  await assert.rejects(db.query("select vanstock_delete_unused_supplier_record('package',$1)",[option]),/Manager access required/)
 }finally{await db.close()}
})
