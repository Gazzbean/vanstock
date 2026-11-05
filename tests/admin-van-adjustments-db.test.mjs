import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const a='00000000-0000-4000-8000-000000000001'
const b='00000000-0000-4000-8000-000000000002'
const admin='00000000-0000-4000-8000-000000000003'
const tech='00000000-0000-4000-8000-000000000004'
const van='00000000-0000-4000-8000-000000000005'
const outsiderVan='00000000-0000-4000-8000-000000000006'
const product='00000000-0000-4000-8000-000000000007'

test('admin van correction is role/company scoped, atomic and audited',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create role anon; create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table profiles(id uuid primary key,company_id uuid,role text);
   create table products(id uuid primary key,company_id uuid,name text,stock_unit text,archived_at timestamptz);
   create table vans(id uuid primary key,company_id uuid,van_number text);
   create table stock(van_id uuid,product_id uuid,quantity numeric(12,2),updated_at timestamptz,primary key(van_id,product_id));
   create table activity_log(company_id uuid,van_id uuid,user_id uuid,product_id uuid,product_name text,type text,quantity numeric,reference text,notes text);
  `)
  await db.query('insert into profiles values ($1,$2,\'admin\'),($3,$2,\'technician\')',[admin,a,tech])
  await db.query('insert into vans values ($1,$2,\'Van #4\'),($3,$4,\'Other company\')',[van,a,outsiderVan,b])
  await db.query('insert into products values ($1,$2,\'TEST – Cable Ties 500pk\',\'ea\',null)',[product,a])
  await db.query('insert into stock(van_id,product_id,quantity) values ($1,$2,946)',[van,product])
  const migration=await readFile(new URL('../supabase/migrations/20261105090000_admin_van_stock_adjustments.sql',import.meta.url),'utf8')
  await db.exec(migration)
  const adjust=(location,op,qty,reference)=>db.query('select vanstock_admin_adjust_van($1,$2,$3,$4,$5) as balance',[location,product,op,qty,reference])
  await db.query("select set_config('test.user_id',$1,false)",[tech])
  await assert.rejects(adjust(van,'set',0,'not permitted'),/Administrator access required/)
  await db.query("select set_config('test.user_id',$1,false)",[admin])
  await assert.rejects(adjust(outsiderVan,'set',0,'wrong company'),/Van not found for company/)
  await assert.rejects(adjust(van,'remove',947,'too much'),/Insufficient van stock/)
  await assert.rejects(adjust(van,'set',0.5,'fractional'),/Whole-number/)
  assert.equal(Number((await adjust(van,'set',0,'TEST-RESET-014-V4')).rows[0].balance),0)
  const logs=(await db.query('select type,quantity,reference,notes from activity_log')).rows
  assert.equal(logs.length,1)
  assert.equal(Number(logs[0].quantity),946)
  assert.match(logs[0].notes,/Previous: 946\.00 ea\. New: 0\.00 ea/)
  assert.equal(logs[0].reference,'TEST-RESET-014-V4')
  assert.equal(Number((await db.query('select quantity from stock')).rows[0].quantity),0)
  await assert.rejects(adjust(van,'set',0,'repeat'),/No stock change/)
 }finally{await db.close()}
})
