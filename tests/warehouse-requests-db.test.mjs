import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261103060000_warehouse_replenishment_requests.sql',import.meta.url)
const permissionMigration=new URL('../supabase/migrations/20261103070000_warehouse_rpc_permission_gate.sql',import.meta.url)
const inventoryMigration=new URL('../supabase/migrations/20261030_warehouse_inventory_stage.sql',import.meta.url)
const ids={
  company:'00000000-0000-4000-8000-000000000001',
  tech:'00000000-0000-4000-8000-000000000002',
  manager:'00000000-0000-4000-8000-000000000003',
  warehouse:'00000000-0000-4000-8000-000000000004',
  van:'00000000-0000-4000-8000-000000000005',
  product:'00000000-0000-4000-8000-000000000006',
  foreignCompany:'00000000-0000-4000-8000-000000000007',
  foreignVan:'00000000-0000-4000-8000-000000000008',
  foreignProduct:'00000000-0000-4000-8000-000000000009',
}

test('warehouse requests: permission, review, atomic fulfilment and repeat protection',async t=>{
  const db=new PGlite()
  try{
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
      create table companies(id uuid primary key);
      create table profiles(id uuid primary key,company_id uuid,role text,van_id uuid,is_active boolean);
      create table vans(id uuid primary key,company_id uuid,van_number text);
      create table products(id uuid primary key,company_id uuid,name text,stock_unit text,
        archived_at timestamptz,min_stock numeric);
      create table user_authorized_vans(user_id uuid,van_id uuid);
      create table user_warehouse_permissions(user_id uuid,company_id uuid,can_request boolean,
        can_issue boolean default false,can_receive boolean default false);
      create table stock(van_id uuid,product_id uuid,quantity numeric,updated_at timestamptz,
        primary key(van_id,product_id));
      create table activity_log(id bigint generated always as identity primary key,
        company_id uuid,van_id uuid,user_id uuid,product_id uuid,product_name text,
        type text,quantity numeric,reference text,notes text);
      create function public.adjust_warehouse_stock(uuid,uuid,text,numeric,text)
      returns numeric language sql as 'select 1::numeric';
      create function public.post_warehouse_opening_stock(uuid,uuid,numeric,text)
      returns void language plpgsql as $fn$ begin null; end;$fn$;
    `)
    await db.query('insert into companies values($1)',[ids.company])
    await db.query('insert into companies values($1)',[ids.foreignCompany])
    await db.query("insert into profiles values($1,$3,'technician',$4,true),($2,$3,'manager',null,true)",
      [ids.tech,ids.manager,ids.company,ids.van])
    await db.query("insert into vans values($1,$2,'Van #3')",[ids.van,ids.company])
    await db.query("insert into vans values($1,$2,'Other company van')",[ids.foreignVan,ids.foreignCompany])
    await db.query("insert into products values($1,$2,'TEST – Cable Ties 500pk','ea',null,2)",[ids.product,ids.company])
    await db.query("insert into products values($1,$2,'Other company parts','ea',null,2)",[ids.foreignProduct,ids.foreignCompany])
    await db.query('insert into user_authorized_vans values($1,$2)',[ids.tech,ids.van])
    await db.query('insert into user_warehouse_permissions values($1,$2,false)',[ids.tech,ids.company])
    await db.exec(await readFile(inventoryMigration,'utf8'))
    await db.query("insert into warehouses(id,company_id,name) values($1,$2,'Test Warehouse')",[ids.warehouse,ids.company])
    await db.query('insert into warehouse_stock(warehouse_id,product_id,quantity) values($1,$2,500)',[ids.warehouse,ids.product])
    await db.exec(await readFile(migration,'utf8'))
    await db.exec(await readFile(permissionMigration,'utf8'))
    await db.query("select set_config('test.user_id',$1,false)",[ids.tech])
    const request=()=>db.query('select create_warehouse_replenishment_request($1,$2,$3,10,$4) as id',
      [ids.warehouse,ids.van,ids.product,'JOB-001'])
    await t.test('technician without request permission cannot submit',async()=>{
      await assert.rejects(request(),/permission required/)
    })
    await db.query('update user_warehouse_permissions set can_request=true')
    await t.test('request cannot target another company or unassigned van',async()=>{
      await assert.rejects(db.query('select create_warehouse_replenishment_request($1,$2,$3,10,$4)',
        [ids.warehouse,ids.foreignVan,ids.product,'JOB-X']),/Van not found for company/)
      await assert.rejects(db.query('select create_warehouse_replenishment_request($1,$2,$3,10,$4)',
        [ids.warehouse,ids.van,ids.foreignProduct,'JOB-X']),/Active product not found/)
    })
    await t.test('whole-unit products reject fractional quantities',async()=>{
      await assert.rejects(db.query('select create_warehouse_replenishment_request($1,$2,$3,1.5,$4)',
        [ids.warehouse,ids.van,ids.product,'JOB-X']),/Whole stock units required/)
    })
    await t.test('archived products cannot be requested',async()=>{
      await db.query('update products set archived_at=now() where id=$1',[ids.product])
      await assert.rejects(request(),/Active product not found/)
      await db.query('update products set archived_at=null where id=$1',[ids.product])
    })
    const id=(await request()).rows[0].id
    await t.test('request creates no stock movement',async()=>{
      const stock=await db.query('select quantity from warehouse_stock')
      assert.equal(Number(stock.rows[0].quantity),500)
      assert.equal((await db.query('select count(*)::int as n from stock')).rows[0].n,0)
    })
    await t.test('requester cannot self-approve',async()=>{
      await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'approve')",[id]),/Manager/)
    })
    await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
    await db.query("select process_warehouse_replenishment_request($1,'approve')",[id])
    await t.test('approval still creates no stock movement',async()=>{
      assert.equal(Number((await db.query('select quantity from warehouse_stock')).rows[0].quantity),500)
    })
    await db.query("select process_warehouse_replenishment_request($1,'fulfil')",[id])
    await t.test('fulfilment moves stock exactly once',async()=>{
      assert.equal(Number((await db.query('select quantity from warehouse_stock')).rows[0].quantity),490)
      assert.equal(Number((await db.query('select quantity from stock')).rows[0].quantity),10)
      await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'fulfil')",[id]),/Only approved/)
      assert.equal(Number((await db.query('select quantity from warehouse_stock')).rows[0].quantity),490)
      const audit=await db.query('select user_id,type,quantity,reference,product_name from activity_log')
      assert.equal(audit.rows.length,1,'One physical movement must produce exactly one audit event')
      assert.equal(audit.rows[0].user_id,ids.manager)
      assert.equal(audit.rows[0].type,'warehouse-to-van')
      assert.equal(Number(audit.rows[0].quantity),10)
      assert.match(audit.rows[0].reference,/Test Warehouse \/ Van #3 \/ Request/)
      assert.match(audit.rows[0].product_name,/Cable Ties/)
    })
    await t.test('insufficient warehouse stock rolls back fulfilment status',async()=>{
      await db.query("select set_config('test.user_id',$1,false)",[ids.tech])
      const next=(await db.query('select create_warehouse_replenishment_request($1,$2,$3,500,$4) as id',
        [ids.warehouse,ids.van,ids.product,'JOB-002'])).rows[0].id
      await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
      await db.query("select process_warehouse_replenishment_request($1,'approve')",[next])
      await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'fulfil')",[next]),/Insufficient/)
      assert.equal((await db.query('select status from warehouse_replenishment_requests where id=$1',[next])).rows[0].status,'approved')
      assert.equal((await db.query('select count(*)::int as n from activity_log')).rows[0].n,1)
    })
  }finally{await db.close()}
})
