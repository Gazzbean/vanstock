import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const migration = new URL('../supabase/migrations/20261106090000_stock_movement_references.sql', import.meta.url)

test('internal stock references are unique, dated in Perth and separated by company and type', async () => {
 const db = new PGlite()
 try {
  await db.exec(`
   create role anon;
   create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table public.companies(id uuid primary key);
   create table public.profiles(id uuid primary key,company_id uuid,is_active boolean);
   insert into public.companies values
    ('00000000-0000-4000-8000-000000000001'),
    ('00000000-0000-4000-8000-000000000002');
   insert into public.profiles values
    ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001',true),
    ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002',true);
   select set_config('test.user_id','00000000-0000-4000-8000-000000000011',false);
  `)
  await db.exec(await readFile(migration,'utf8'))
  const first = await db.query("select public.vanstock_next_stock_reference('TRF') as ref")
  const second = await db.query("select public.vanstock_next_stock_reference('TRF') as ref")
  assert.match(first.rows[0].ref,/^TRF-\d{8}-001$/)
  assert.equal(second.rows[0].ref,first.rows[0].ref.replace(/001$/,'002'))
  const adjusted = await db.query("select public.vanstock_next_stock_reference('ADJ') as ref")
  assert.equal(adjusted.rows[0].ref,'ADJ-'+first.rows[0].ref.slice(4,12)+'-001')
  await db.exec('begin')
  const rolledBack = await db.query("select public.vanstock_next_stock_reference('TRF') as ref")
  assert.match(rolledBack.rows[0].ref,/-003$/)
  await db.exec('rollback')
  const next = await db.query("select public.vanstock_next_stock_reference('TRF') as ref")
  assert.equal(next.rows[0].ref,rolledBack.rows[0].ref,'failed transactions do not consume a reference')
  await db.exec("select set_config('test.user_id','00000000-0000-4000-8000-000000000012',false)")
  const other = await db.query("select public.vanstock_next_stock_reference('TRF') as ref")
  assert.equal(other.rows[0].ref,first.rows[0].ref)
  await assert.rejects(()=>db.query("select public.vanstock_next_stock_reference('RCV')"),/Unsupported stock reference type/)
 } finally {await db.close()}
})
