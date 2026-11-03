import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261103070000_warehouse_rpc_permission_gate.sql',import.meta.url)
const company='00000000-0000-4000-8000-000000000001'
const technician='00000000-0000-4000-8000-000000000002'
const manager='00000000-0000-4000-8000-000000000003'
const van3='00000000-0000-4000-8000-000000000004'
const van4='00000000-0000-4000-8000-000000000005'
const warehouse='00000000-0000-4000-8000-000000000006'
const product='00000000-0000-4000-8000-000000000007'

test('warehouse gate checks saved grants before invoking legacy functions',async t=>{
  const db=new PGlite()
  try{
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
      create table public.profiles(id uuid primary key,company_id uuid,role text,van_id uuid,is_active boolean);
      create table public.user_warehouse_permissions(user_id uuid,company_id uuid,
        can_issue boolean,can_receive boolean);
      create table public.test_legacy_calls(action text,van_id uuid);
      create function public.move_warehouse_van_stock(uuid,uuid,uuid,numeric,text,text,text)
      returns void language plpgsql as $fn$ begin
        insert into public.test_legacy_calls values ($5,$2);
      end;$fn$;
      create function public.adjust_warehouse_stock(uuid,uuid,text,numeric,text)
      returns numeric language sql as 'select 1::numeric';
      create function public.post_warehouse_opening_stock(uuid,uuid,numeric,text)
      returns void language plpgsql as $fn$ begin null; end;$fn$;
    `)
    await db.query("insert into profiles values($1,$3,'technician',$4,true),($2,$3,'manager',null,true)",
      [technician,manager,company,van3])
    await db.query('insert into user_warehouse_permissions values($1,$2,false,false)',[technician,company])
    await db.exec(await readFile(migration,'utf8'))
    const move=(van,direction)=>db.query(
      'select public.vanstock_warehouse_move($1,$2,$3,1,$4,$5,$6)',
      [warehouse,van,product,direction,'TEST',''])
    await db.query("select set_config('test.user_id',$1,false)",[technician])
    await t.test('unauthorised technician denied without side effects',async()=>{
      await assert.rejects(move(van3,'warehouse-to-van'),/Warehouse issue permission required/)
      assert.equal((await db.query('select count(*)::int as n from test_legacy_calls')).rows[0].n,0)
    })
    await db.query('update user_warehouse_permissions set can_issue=true')
    await t.test('technician cannot use grant on another van',async()=>{
      await assert.rejects(move(van4,'warehouse-to-van'),/assigned default van/)
    })
    await t.test('issue and return are distinct grants',async()=>{
      await move(van3,'warehouse-to-van')
      await assert.rejects(move(van3,'van-to-warehouse'),/Warehouse receive permission required/)
      await db.query('update user_warehouse_permissions set can_receive=true')
      await move(van3,'van-to-warehouse')
      assert.equal((await db.query('select count(*)::int as n from test_legacy_calls')).rows[0].n,2)
    })
    await t.test('technician cannot adjust or post opening count',async()=>{
      await assert.rejects(db.query('select vanstock_warehouse_adjust($1,$2,$3,1,$4)',
        [warehouse,product,'add','TEST']),/management approval/)
      await assert.rejects(db.query('select vanstock_warehouse_opening_stock($1,$2,1,$3)',
        [warehouse,product,'TEST']),/management approval/)
    })
    await db.query("select set_config('test.user_id',$1,false)",[manager])
    await t.test('management authority preserved',async()=>{
      await move(van4,'warehouse-to-van')
      assert.equal((await db.query('select count(*)::int as n from test_legacy_calls')).rows[0].n,3)
    })
  }finally{await db.close()}
})
