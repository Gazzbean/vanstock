import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const migration = new URL('../supabase/migrations/20261110100000_van_scoped_notification_lifecycle.sql', import.meta.url)
const ids={company:'00000000-0000-4000-8000-000000000001',user:'00000000-0000-4000-8000-000000000002',van:'00000000-0000-4000-8000-000000000003',request:'00000000-0000-4000-8000-000000000004'}

test('receiving notifications follow van assignment and preserve history', async()=>{
 const db = new PGlite()
 try {
  await db.exec(`create role anon; create role authenticated;
   create schema if not exists public;
   create table public.profiles(id uuid primary key, company_id uuid, is_active boolean);
   create table public.user_access_capabilities(user_id uuid, company_id uuid, technician_access boolean);
   create table public.user_authorized_vans(user_id uuid, van_id uuid, company_id uuid);
   create table public.warehouse_replenishment_requests(id uuid primary key, company_id uuid, van_id uuid, status text);
   create table public.warehouse_notifications(id uuid primary key default gen_random_uuid(), company_id uuid, user_id uuid, request_id uuid, event_type text, read_at timestamptz, dismissed_at timestamptz, unique(user_id,request_id,event_type));`)
  await db.exec(await readFile(migration,'utf8'))
  const {company,user,van,request}=ids
  await db.exec(`insert into public.profiles values ('${user}','${company}',true);
   insert into public.user_access_capabilities values ('${user}','${company}',true);
   insert into public.warehouse_replenishment_requests values ('${request}','${company}','${van}','issued');
   insert into public.user_authorized_vans values ('${user}','${van}','${company}');`)
  let result=await db.query('select event_type,dismissed_at from public.warehouse_notifications')
  assert.equal(result.rows.length,1)
  assert.equal(result.rows[0].event_type,'issued')
  assert.equal(result.rows[0].dismissed_at,null)

  await db.exec(`update public.warehouse_replenishment_requests set status='fulfilled' where id='${request}'`)
  result=await db.query('select read_at,dismissed_at from public.warehouse_notifications')
  assert.ok(result.rows[0].read_at)
  assert.ok(result.rows[0].dismissed_at)

  await db.exec(`delete from public.user_authorized_vans where user_id='${user}'`)
  result=await db.query('select count(*)::int as count from public.warehouse_notifications')
  assert.equal(result.rows[0].count,1)
 } finally {await db.close()}
})
