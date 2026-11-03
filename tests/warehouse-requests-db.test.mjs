import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261103060000_warehouse_replenishment_requests.sql',import.meta.url)
const permissionMigration=new URL('../supabase/migrations/20261103070000_warehouse_rpc_permission_gate.sql',import.meta.url)
const ids={
  company:'00000000-0000-4000-8000-000000000001',
  tech:'00000000-0000-4000-8000-000000000002',
  manager:'00000000-0000-4000-8000-000000000003',
  warehouse:'00000000-0000-4000-8000-000000000004',
  van:'00000000-0000-4000-8000-000000000005',
  product:'00000000-0000-4000-8000-000000000006',
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
      create table warehouses(id uuid primary key,company_id uuid);
      create table vans(id uuid primary key,company_id uuid);
      create table products(id uuid primary key,company_id uuid,stock_unit text,archived_at timestamptz);
      create table user_authorized_vans(user_id uuid,van_id uuid);
      create table user_warehouse_permissions(user_id uuid,company_id uuid,can_request boolean,
        can_issue boolean default false,can_receive boolean default false);
      create table warehouse_stock(warehouse_id uuid,product_id uuid,quantity numeric,
        primary key(warehouse_id,product_id));
      create table stock(van_id uuid,product_id uuid,quantity numeric,
        primary key(van_id,product_id));
      -- A transactional movement stand-in: the production movement RPC is tested separately.
      create function public.move_warehouse_van_stock(uuid,uuid,uuid,numeric,text,text,text)
      returns void language plpgsql as $fn$
      begin
        update public.warehouse_stock set quantity=quantity-$4 where warehouse_id=$1 and product_id=$3
          and quantity >= $4;
        if not found then raise exception 'Insufficient warehouse stock'; end if;
        insert into public.stock values ($2,$3,$4) on conflict (van_id,product_id)
          do update set quantity=public.stock.quantity+excluded.quantity;
      end;$fn$;
      create function public.adjust_warehouse_stock(uuid,uuid,text,numeric,text)
      returns numeric language sql as 'select 1::numeric';
      create function public.post_warehouse_opening_stock(uuid,uuid,numeric,text)
      returns void language plpgsql as $fn$ begin null; end;$fn$;
    `)
    await db.query('insert into companies values($1)',[ids.company])
    await db.query("insert into profiles values($1,$3,'technician',$4,true),($2,$3,'manager',null,true)",
      [ids.tech,ids.manager,ids.company,ids.van])
    await db.query('insert into warehouses values($1,$2)',[ids.warehouse,ids.company])
    await db.query('insert into vans values($1,$2)',[ids.van,ids.company])
    await db.query("insert into products values($1,$2,'ea',null)",[ids.product,ids.company])
    await db.query('insert into user_authorized_vans values($1,$2)',[ids.tech,ids.van])
    await db.query('insert into user_warehouse_permissions values($1,$2,false)',[ids.tech,ids.company])
    await db.query('insert into warehouse_stock values($1,$2,500)',[ids.warehouse,ids.product])
    await db.exec(await readFile(migration,'utf8'))
    await db.exec(await readFile(permissionMigration,'utf8'))
    await db.query("select set_config('test.user_id',$1,false)",[ids.tech])
    const request=()=>db.query('select create_warehouse_replenishment_request($1,$2,$3,10,$4) as id',
      [ids.warehouse,ids.van,ids.product,'JOB-001'])
    await t.test('technician without request permission cannot submit',async()=>{
      await assert.rejects(request(),/permission required/)
    })
    await db.query('update user_warehouse_permissions set can_request=true')
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
    })
    await t.test('insufficient warehouse stock rolls back fulfilment status',async()=>{
      await db.query("select set_config('test.user_id',$1,false)",[ids.tech])
      const next=(await db.query('select create_warehouse_replenishment_request($1,$2,$3,500,$4) as id',
        [ids.warehouse,ids.van,ids.product,'JOB-002'])).rows[0].id
      await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
      await db.query("select process_warehouse_replenishment_request($1,'approve')",[next])
      await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'fulfil')",[next]),/Insufficient/)
      assert.equal((await db.query('select status from warehouse_replenishment_requests where id=$1',[next])).rows[0].status,'approved')
    })
  }finally{await db.close()}
})
