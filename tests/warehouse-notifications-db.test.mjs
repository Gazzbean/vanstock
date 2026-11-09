import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261105093000_warehouse_notifications.sql',import.meta.url)
const dismissal=new URL('../supabase/migrations/20261109130000_notification_inbox_dismissal.sql',import.meta.url)
const ids={
 company:'00000000-0000-4000-8000-000000000001',
 other:'00000000-0000-4000-8000-000000000002',
 requester:'00000000-0000-4000-8000-000000000003',
 admin:'00000000-0000-4000-8000-000000000004',
 manager:'00000000-0000-4000-8000-000000000005',
 outsider:'00000000-0000-4000-8000-000000000006',
 request:'00000000-0000-4000-8000-000000000007',
}

test('warehouse notifications target responsible staff, deduplicate events and protect reads',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create role anon; create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table public.companies(id uuid primary key);
   create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
   create table public.user_warehouse_permissions(user_id uuid,company_id uuid,can_issue boolean);
   create table public.user_access_capabilities(user_id uuid,company_id uuid,office_access boolean);
   create table public.warehouse_replenishment_requests(
    id uuid primary key,company_id uuid,requested_by uuid,reviewed_by uuid,
    fulfilled_by uuid,status text);
  `)
  await db.query('insert into companies values ($1),($2)',[ids.company,ids.other])
  await db.query(`insert into profiles values
   ($1,$5,'technician',true),($2,$5,'admin',true),($3,$5,'manager',true),
   ($4,$6,'admin',true)`, [ids.requester,ids.admin,ids.manager,ids.outsider,ids.company,ids.other])
  await db.exec(await readFile(migration,'utf8'))
  await db.exec(await readFile(dismissal,'utf8'))
  const inbox=async()=> (await db.query('select user_id,event_type,read_at from warehouse_notifications order by event_type,user_id')).rows
  await db.query("insert into warehouse_replenishment_requests(id,company_id,requested_by,status) values($1,$2,$3,'pending')",[ids.request,ids.company,ids.requester])
  assert.deepEqual((await inbox()).filter(n=>n.event_type==='requested').map(n=>n.user_id).sort(),[ids.admin,ids.manager].sort())
  await db.query("update warehouse_replenishment_requests set status='approved',reviewed_by=$1 where id=$2",[ids.admin,ids.request])
  assert.deepEqual((await inbox()).filter(n=>n.event_type==='approved').map(n=>n.user_id).sort(),[ids.requester,ids.manager].sort())
  await db.query("update warehouse_replenishment_requests set status='fulfilled',fulfilled_by=$1 where id=$2",[ids.admin,ids.request])
  assert.deepEqual((await inbox()).filter(n=>n.event_type==='fulfilled').map(n=>n.user_id),[ids.requester])
  const rejectedRequest='00000000-0000-4000-8000-000000000008'
  await db.query("insert into warehouse_replenishment_requests(id,company_id,requested_by,status) values($1,$2,$3,'pending')",[rejectedRequest,ids.company,ids.requester])
  await db.query("update warehouse_replenishment_requests set status='rejected',reviewed_by=$1 where id=$2",[ids.manager,rejectedRequest])
  assert.deepEqual((await inbox()).filter(n=>n.event_type==='rejected').map(n=>n.user_id),[ids.requester])
  const before=(await inbox()).length
  await db.query('update warehouse_replenishment_requests set status=status where id=$1',[ids.request])
  assert.equal((await inbox()).length,before)
  const notice=(await db.query('select id from warehouse_notifications where user_id=$1 limit 1',[ids.requester])).rows[0].id
  await db.query("select set_config('test.user_id',$1,false)",[ids.outsider])
  assert.equal((await db.query('select vanstock_mark_warehouse_notification_read($1) as updated',[notice])).rows[0].updated,false)
  await db.query("select set_config('test.user_id',$1,false)",[ids.requester])
  assert.equal((await db.query('select vanstock_mark_warehouse_notification_read($1) as updated',[notice])).rows[0].updated,true)
  assert.ok((await inbox()).find(n=>n.user_id===ids.requester&&n.read_at))
  const otherNotice=(await db.query('select id from warehouse_notifications where user_id=$1 limit 1',[ids.admin])).rows[0].id
  await assert.equal((await db.query('select vanstock_dismiss_warehouse_notification($1) as dismissed',[otherNotice])).rows[0].dismissed,false)
  assert.equal((await db.query('select vanstock_dismiss_warehouse_notification($1) as dismissed',[notice])).rows[0].dismissed,true)
  const marked=(await db.query('select read_at,dismissed_at from warehouse_notifications where id=$1',[notice])).rows[0]
  assert.ok(marked.read_at&&marked.dismissed_at)
  assert.equal((await db.query('select vanstock_clear_read_warehouse_notifications() as count')).rows[0].count,0)
  const secondNotice=(await db.query('select id from warehouse_notifications where user_id=$1 and id<>$2 limit 1',[ids.requester,notice])).rows[0].id
  await db.query('select vanstock_mark_warehouse_notification_read($1)',[secondNotice])
  assert.equal((await db.query('select vanstock_clear_read_warehouse_notifications() as count')).rows[0].count,1)
  assert.equal((await db.query('select dismissed_at from warehouse_notifications where id=$1',[secondNotice])).rows[0].dismissed_at!==null,true)
  assert.equal((await db.query('select count(*)::int as total from warehouse_notifications where user_id=$1',[ids.requester])).rows[0].total,3)
  await db.query("select set_config('test.user_id',$1,false)",[ids.admin])
  assert.equal((await db.query('select vanstock_clear_read_warehouse_notifications() as count')).rows[0].count,0)
  assert.equal((await db.query('select dismissed_at from warehouse_notifications where id=$1',[otherNotice])).rows[0].dismissed_at,null)
 }finally{await db.close()}
})
