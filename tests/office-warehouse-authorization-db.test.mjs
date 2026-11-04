import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261104080000_office_warehouse_authorization.sql',import.meta.url)
const company='00000000-0000-4000-8000-000000000001'
const otherCompany='00000000-0000-4000-8000-000000000002'
const office='00000000-0000-4000-8000-000000000003'
const technician='00000000-0000-4000-8000-000000000004'
const manager='00000000-0000-4000-8000-000000000005'
const van3='00000000-0000-4000-8000-000000000006'
const van4='00000000-0000-4000-8000-000000000007'
const outsiderVan='00000000-0000-4000-8000-000000000008'
const warehouse='00000000-0000-4000-8000-000000000009'
const product='00000000-0000-4000-8000-000000000010'

test('Office warehouse grants and technician van restrictions are enforced in the database',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create role anon; create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table public.profiles(id uuid primary key,company_id uuid,role text,van_id uuid,is_active boolean);
   create table public.user_access_capabilities(user_id uuid,company_id uuid,office_access boolean);
   create table public.user_warehouse_permissions(user_id uuid,company_id uuid,
    can_request boolean,can_issue boolean,can_receive boolean);
   create table public.user_authorized_vans(user_id uuid,company_id uuid,van_id uuid);
   create table public.vans(id uuid primary key,company_id uuid,active boolean,van_number text);
   create table public.warehouses(id uuid primary key,company_id uuid,name text);
   create table public.products(id uuid primary key,company_id uuid,name text,stock_unit text,archived_at timestamptz);
   create table public.warehouse_replenishment_requests(
    id uuid primary key default gen_random_uuid(),company_id uuid,warehouse_id uuid,
    van_id uuid,product_id uuid,quantity numeric,reference text,requested_by uuid);
   create table public.stock(van_id uuid,product_id uuid,quantity numeric,updated_at timestamptz,
    primary key(van_id,product_id));
   create table public.warehouse_stock(warehouse_id uuid,product_id uuid,quantity numeric,
    updated_at timestamptz,primary key(warehouse_id,product_id));
   create table public.activity_log(company_id uuid,van_id uuid,user_id uuid,product_id uuid,
    product_name text,type text,quantity numeric,reference text,notes text);
  `)
  await db.query(`insert into profiles values
   ($1,$4,'technician',null,true),($2,$4,'technician',$5,true),($3,$4,'manager',null,true)`,
   [office,technician,manager,company,van3])
  await db.query('insert into user_access_capabilities values($1,$2,true),($3,$2,false)',
   [office,company,technician])
  await db.query(`insert into user_warehouse_permissions values
   ($1,$3,true,true,false),($2,$3,true,true,true)`,[office,technician,company])
  await db.query('insert into user_authorized_vans values($1,$2,$3)',[technician,company,van3])
  await db.query(`insert into vans values
   ($1,$4,true,'Van #3'),($2,$4,true,'Van #4'),($3,$5,true,'Other Company')`,
   [van3,van4,outsiderVan,company,otherCompany])
  await db.query("insert into warehouses values($1,$2,'Warehouse')",[warehouse,company])
  await db.query("insert into products values($1,$2,'Safety Goggles','ea',null)",[product,company])
  await db.query('insert into warehouse_stock values($1,$2,10,now())',[warehouse,product])
  await db.exec(await readFile(migration,'utf8'))
  const use=async user=>db.query("select set_config('test.user_id',$1,false)",[user])
  const permit=(direction,van)=>db.query('select public.vanstock_warehouse_require_permission($1,$2)',[direction,van])
  const request=van=>db.query('select public.create_warehouse_replenishment_request($1,$2,$3,1,$4)',
   [warehouse,van,product,'TEST-01'])
  await use(office)
  await t.test('Office grant works for any company van, but not returns without a grant',async()=>{
   await permit('issue',van3);await permit('issue',van4)
   await assert.rejects(permit('receive',van3),/Warehouse receive permission required/)
   await assert.rejects(permit('issue',outsiderVan),/Van not available/)
   await assert.rejects(permit('adjust',van3),/management approval/)
   await request(van4)
  })
  await t.test('Office movement is atomic and produces one audit event',async()=>{
   const move=(direction,qty)=>db.query(
    'select public.move_warehouse_van_stock($1,$2,$3,$4,$5,$6,$7)',
    [warehouse,van4,product,qty,direction,'JOB-123','Test transfer'])
   await move('warehouse-to-van',3)
   const afterIssue=await db.query('select quantity from warehouse_stock where warehouse_id=$1',[warehouse])
   assert.equal(Number(afterIssue.rows[0].quantity),7)
   const afterVan=await db.query('select quantity from stock where van_id=$1',[van4])
   assert.equal(Number(afterVan.rows[0].quantity),3)
   await assert.rejects(move('warehouse-to-van',20),/Insufficient warehouse stock/)
   await db.query('update user_warehouse_permissions set can_receive=true where user_id=$1',[office])
   await move('van-to-warehouse',1)
   const log=await db.query('select type,quantity,user_id from activity_log order by type')
   assert.equal(log.rows.length,2)
   assert.ok(log.rows.every(entry=>entry.user_id===office))
   const final=await db.query('select quantity from warehouse_stock where warehouse_id=$1',[warehouse])
   assert.equal(Number(final.rows[0].quantity),8)
  })
  await use(technician)
  await t.test('Technician may only move or request stock for authorised vans',async()=>{
   await permit('issue',van3)
   await assert.rejects(permit('issue',van4),/not authorised/)
   await request(van3)
   await assert.rejects(request(van4),/Not authorised for receiving van/)
  })
  await use(manager)
  await t.test('Manager can work across company vans without a separate warehouse grant',async()=>{
   await permit('issue',van4);await permit('adjust',van3)
  })
  await use(office)
  await db.query('update profiles set is_active=false where id=$1',[office])
  await t.test('Disabled accounts cannot use warehouse functions',async()=>{
   await assert.rejects(permit('issue',van3),/Active login required/)
   await assert.rejects(request(van3),/Active login required/)
  })
 }finally{await db.close()}
})
