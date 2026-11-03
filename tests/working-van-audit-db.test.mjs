import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

test('working-van audit is append-only for authenticated clients and never moves inventory',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table companies(id uuid primary key);
   create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
   create table vans(id uuid primary key,company_id uuid,van_number text,active boolean);
   create table user_access_capabilities(user_id uuid,company_id uuid,office_access boolean,technician_access boolean);
   create table user_authorized_vans(user_id uuid,company_id uuid,van_id uuid);
   create table stock(van_id uuid,quantity numeric);`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261103083000_working_van_selection_audit.sql',import.meta.url),'utf8'))
  const ids=Array.from({length:5},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
  const [company,user,vanA,vanB,unauthorized]=ids
  await db.query('insert into companies values($1)',[company])
  await db.query("insert into profiles values($1,$2,'technician',true)",[user,company])
  await db.query("insert into vans values($1,$4,'Van #3',true),($2,$4,'Van #4',true),($3,$4,'Van #5',true)",[vanA,vanB,unauthorized,company])
  await db.query('insert into user_access_capabilities values($1,$2,false,true)',[user,company])
  await db.query('insert into user_authorized_vans values($1,$3,$2),($1,$3,$4)',[user,vanA,company,vanB])
  await db.query('insert into stock values($1,500),($2,200)',[vanA,vanB])
  await db.query("select set_config('test.user_id',$1,false)",[user])
  await t.test('server-recorded change stores old/new vans',async()=>{
   await db.query('insert into working_van_selection_events(company_id,user_id,previous_van_id,selected_van_id) values($1,$2,$3,$4)',[company,user,vanA,vanB])
   const events=(await db.query('select previous_van_id,selected_van_id from working_van_selection_events')).rows
   assert.deepEqual(events,[{previous_van_id:vanA,selected_van_id:vanB}])
  })
  await t.test('a no-op change is rejected by database constraint',async()=>{
   await assert.rejects(db.query('insert into working_van_selection_events(company_id,user_id,previous_van_id,selected_van_id) values($1,$2,$3,$3)',[company,user,vanB]),/check constraint/)
   assert.equal((await db.query('select count(*)::int as n from working_van_selection_events')).rows[0].n,1)
  })
  await t.test('authenticated clients cannot directly forge history',async()=>{
   await db.exec('set role authenticated')
   await assert.rejects(db.query('insert into working_van_selection_events(company_id,user_id,previous_van_id,selected_van_id) values($1,$2,$3,$4)',[company,user,vanA,unauthorized]),/permission denied/)
   await db.exec('reset role')
  })
  await t.test('inventory balances are unchanged',async()=>{
   const result=await db.query('select quantity from stock order by quantity')
   assert.deepEqual(result.rows.map(x=>Number(x.quantity)),[200,500])
  })
 }finally{await db.close()}
})
