import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const base=new URL('../supabase/migrations/20261103060000_warehouse_replenishment_requests.sql',import.meta.url)
const inventory=new URL('../supabase/migrations/20261030_warehouse_inventory_stage.sql',import.meta.url)
const dual=new URL('../supabase/migrations/20261107080000_warehouse_two_confirmations.sql',import.meta.url)
const managerPermissions=new URL('../supabase/migrations/20261109090000_manager_operation_permissions.sql',import.meta.url)
const managerGate=new URL('../supabase/migrations/20261109100000_enforce_manager_warehouse_permissions.sql',import.meta.url)
const discrepancies=new URL('../supabase/migrations/20261109110000_warehouse_receipt_discrepancies.sql',import.meta.url)
const ids={company:'00000000-0000-4000-8000-000000000001',warehouse:'00000000-0000-4000-8000-000000000002',
 van:'00000000-0000-4000-8000-000000000003',product:'00000000-0000-4000-8000-000000000004',
 manager:'00000000-0000-4000-8000-000000000005',receiver:'00000000-0000-4000-8000-000000000006',
 outsider:'00000000-0000-4000-8000-000000000007'}

test('warehouse issue and receiving acceptance are distinct, atomic and authorised',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create role anon;create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as
     'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table companies(id uuid primary key);
   create table profiles(id uuid primary key,company_id uuid,role text,van_id uuid,is_active boolean);
   create table vans(id uuid primary key,company_id uuid,van_number text,active boolean default true);
   create table products(id uuid primary key,company_id uuid,name text,stock_unit text,archived_at timestamptz,min_stock numeric);
   create table user_authorized_vans(user_id uuid,van_id uuid);
   create table user_warehouse_permissions(user_id uuid,company_id uuid,can_request boolean,can_issue boolean,can_receive boolean);
   create table stock(van_id uuid,product_id uuid,quantity numeric,updated_at timestamptz,primary key(van_id,product_id));
   create table activity_log(id bigint generated always as identity primary key,company_id uuid,van_id uuid,
     user_id uuid,product_id uuid,product_name text,type text,quantity numeric,reference text,notes text);
   create table warehouse_notifications(id uuid primary key default gen_random_uuid(),company_id uuid,
     user_id uuid,request_id uuid,event_type text,created_at timestamptz default now(),
     unique(user_id,request_id,event_type),constraint warehouse_notifications_event_type_check
       check(event_type in ('requested','approved','rejected','fulfilled')));
   create table user_access_capabilities(user_id uuid,company_id uuid,office_access boolean);
   create function public.adjust_warehouse_stock(uuid,uuid,text,numeric,text) returns numeric language sql as 'select 1::numeric';
   create function public.post_warehouse_opening_stock(uuid,uuid,numeric,text) returns void language plpgsql as $f$begin null;end;$f$;
  `)
  await db.query('insert into companies values($1)',[ids.company])
  await db.query("insert into profiles values($1,$4,'manager',null,true),($2,$4,'technician',$5,true),($3,$4,'technician',null,true)",
   [ids.manager,ids.receiver,ids.outsider,ids.company,ids.van])
  await db.query("insert into vans(id,company_id,van_number) values($1,$2,'Van #3')",[ids.van,ids.company])
  await db.query("insert into products values($1,$2,'Cable ties','ea',null,2)",[ids.product,ids.company])
  await db.query('insert into user_warehouse_permissions values($1,$2,true,false,false)',[ids.receiver,ids.company])
  await db.exec(await readFile(inventory,'utf8'))
  await db.query("insert into warehouses(id,company_id,name) values($1,$2,'Warehouse')",[ids.warehouse,ids.company])
  await db.query('insert into warehouse_stock(warehouse_id,product_id,quantity) values($1,$2,500)',[ids.warehouse,ids.product])
  await db.exec(await readFile(base,'utf8'))
  await db.exec(await readFile(dual,'utf8'))
  await db.exec(await readFile(managerPermissions,'utf8'))
  await db.exec(await readFile(managerGate,'utf8'))
  await db.exec(await readFile(discrepancies,'utf8'))
  await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
  const request=(await db.query('select create_warehouse_replenishment_request($1,$2,$3,5,$4) as id',
   [ids.warehouse,ids.van,ids.product,'JOB-123'])).rows[0].id
  await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
  await db.query('update manager_operation_permissions set approve_requests=false where user_id=$1',[ids.manager])
  await t.test('Manager cannot approve without saved grant',async()=>{
   await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'approve')",[request]),/permission required to review/)
   assert.equal((await db.query('select status from warehouse_replenishment_requests where id=$1',[request])).rows[0].status,'pending')
  })
  await db.query('update manager_operation_permissions set approve_requests=true,issue_warehouse=false where user_id=$1',[ids.manager])
  await db.query("select process_warehouse_replenishment_request($1,'approve')",[request])
  await t.test('Manager cannot issue without saved grant',async()=>{
   await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'fulfil')",[request]),/permission required to issue/)
  })
  await db.query('update manager_operation_permissions set issue_warehouse=true where user_id=$1',[ids.manager])
  await db.query("select process_warehouse_replenishment_request($1,'fulfil')",[request])
  await t.test('warehouse issue changes only the status',async()=>{
   assert.equal((await db.query('select status from warehouse_replenishment_requests where id=$1',[request])).rows[0].status,'issued')
   assert.equal(Number((await db.query('select quantity from warehouse_stock')).rows[0].quantity),500)
   assert.equal((await db.query('select count(*)::int as n from stock')).rows[0].n,0)
   await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'fulfil')",[request]),/Only approved/)
  })
  await db.query("select set_config('test.user_id',$1,false)",[ids.outsider])
  await t.test('unassigned technician cannot confirm another van',async()=>{
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[request]),/not authorised/)
  })
  await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
  await t.test('receiving discrepancy blocks stock movement until warehouse reconciliation',async()=>{
   await db.query('select report_warehouse_receipt_discrepancy($1,3,$2)',[request,'Two units missing from package'])
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[request]),/Outstanding receipt discrepancy/)
   assert.equal(Number((await db.query('select quantity from warehouse_stock')).rows[0].quantity),500)
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   await db.query('select resolve_warehouse_receipt_discrepancy($1,$2)',[request,'Two missing units physically located and delivered'])
   await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
  })
  await db.query('select confirm_warehouse_replenishment_receipt($1)',[request])
  await t.test('receipt moves the stock once and records the receiver',async()=>{
   assert.equal(Number((await db.query('select quantity from warehouse_stock')).rows[0].quantity),495)
   assert.equal(Number((await db.query('select quantity from stock')).rows[0].quantity),5)
   const row=(await db.query('select status,issued_by,received_by from warehouse_replenishment_requests where id=$1',[request])).rows[0]
   assert.equal(row.status,'fulfilled')
   assert.equal(row.issued_by,ids.manager)
   assert.equal(row.received_by,ids.receiver)
   assert.equal((await db.query('select count(*)::int as n from activity_log')).rows[0].n,1)
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[request]),/already recorded/)
   assert.equal(Number((await db.query('select quantity from stock')).rows[0].quantity),5)
  })
 }finally{await db.close()}
})
