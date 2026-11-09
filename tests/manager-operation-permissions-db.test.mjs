import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261109090000_manager_operation_permissions.sql',import.meta.url)
const ids={company:'00000000-0000-4000-8000-000000000001',other:'00000000-0000-4000-8000-000000000002',
 admin:'00000000-0000-4000-8000-000000000003',manager:'00000000-0000-4000-8000-000000000004',
 outsider:'00000000-0000-4000-8000-000000000005',technician:'00000000-0000-4000-8000-000000000006'}

test('manager permissions are company-scoped, administrator-only and audited',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table public.companies(id uuid primary key);
   create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
  `)
  await db.query('insert into companies values($1),($2)',[ids.company,ids.other])
  await db.query(`insert into profiles values
   ($1,$5,'admin',true),($2,$5,'manager',true),($3,$6,'manager',true),($4,$5,'technician',true)`,
   [ids.admin,ids.manager,ids.outsider,ids.technician,ids.company,ids.other])
  await db.exec(await readFile(migration,'utf8'))
  const before=await db.query('select * from manager_operation_permissions where user_id=$1',[ids.manager])
  assert.equal(before.rows.length,1)
  assert.equal(before.rows[0].approve_requests,true)
  const query='select set_manager_operation_permissions($1,$2,$3,$4,$5,$6,$7)'
  await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
  await assert.rejects(db.query(query,[ids.manager,true,true,true,true,true,true]),/Administrator permission required/)
  await db.query("select set_config('test.user_id',$1,false)",[ids.admin])
  await assert.rejects(db.query(query,[ids.outsider,true,true,true,true,true,true]),/company/)
  await assert.rejects(db.query(query,[ids.technician,true,true,true,true,true,true]),/Manager/)
  await db.query(query,[ids.manager,true,false,false,false,true,false])
  const updated=(await db.query('select * from manager_operation_permissions where user_id=$1',[ids.manager])).rows[0]
  assert.equal(updated.approve_requests,true)
  assert.equal(updated.issue_warehouse,false)
  assert.equal(updated.maintain_catalogue,true)
  const audit=await db.query('select previous_permissions,new_permissions from manager_permission_audit where user_id=$1',[ids.manager])
  assert.equal(audit.rows.length,1)
  assert.equal(audit.rows[0].previous_permissions.issue_warehouse,true)
  assert.equal(audit.rows[0].new_permissions.issue_warehouse,false)
 }finally{await db.close()}
})
