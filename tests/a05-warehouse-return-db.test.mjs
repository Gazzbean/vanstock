import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261114180000_a05_authorised_return_vans.sql',import.meta.url)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('A05 warehouse return gate requires active authorised van, capability and independent grant',async t=>{
 const db=new PGlite()
 const company=id(1),otherCompany=id(2)
 const van1=id(101),van2=id(102),van3=id(103),inactiveVan=id(104)
 const tech=id(11),officeOnly=id(12),manager=id(13),admin=id(14),ungranted=id(15),other=id(16)
 try{
   await db.exec(`
     create role anon;
     create role authenticated;
     create schema auth;
     create function auth.uid() returns uuid language sql stable as
       'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
     create table public.profiles(id uuid primary key,company_id uuid,role text,van_id uuid,is_active boolean);
     create table public.vans(id uuid primary key,company_id uuid,active boolean);
     create table public.user_authorized_vans(user_id uuid,company_id uuid,van_id uuid);
     create table public.user_access_capabilities(user_id uuid,company_id uuid,technician_access boolean,office_access boolean);
     create table public.user_warehouse_permissions(user_id uuid,company_id uuid,can_issue boolean,can_receive boolean);
     create table public.manager_operation_permissions(user_id uuid,company_id uuid,receive_returns boolean,adjust_stock boolean,stocktake_warehouse boolean,issue_warehouse boolean);
     create function public.vanstock_manager_has_permission(p_permission text)
       returns boolean language sql stable security definer as $m$
       select case p_permission
         when 'receive_returns' then coalesce(m.receive_returns,false)
         when 'adjust_stock' then coalesce(m.adjust_stock,false)
         when 'stocktake_warehouse' then coalesce(m.stocktake_warehouse,false)
         when 'issue_warehouse' then coalesce(m.issue_warehouse,false)
         else false end
       from public.manager_operation_permissions m
       where m.user_id=auth.uid() $m$;
     create function public.vanstock_warehouse_require_permission(p_action text,p_van_id uuid default null)
       returns void language plpgsql security definer as $old$
         begin raise exception 'Old default-van-only gate'; end;$old$;
     revoke execute on function public.vanstock_warehouse_require_permission(text,uuid) from public,anon;
     grant execute on function public.vanstock_warehouse_require_permission(text,uuid) to authenticated;
   `)
   for(const [u,c,role,v,active] of [
     [tech,company,'technician',van1,true],
     [officeOnly,company,'technician',van1,true],
     [manager,company,'manager',null,true],
     [admin,company,'admin',null,true],
     [ungranted,company,'technician',van1,true],
     [other,otherCompany,'technician',van3,true]
   ])await db.query('insert into public.profiles values($1,$2,$3,$4,$5)',[u,c,role,v,active])
   for(const [v,c,active] of [[van1,company,true],[van2,company,true],[van3,otherCompany,true],[inactiveVan,company,false]])
      await db.query('insert into public.vans values($1,$2,$3)',[v,c,active])
   for(const [u,c,v] of [
     [tech,company,van1],[tech,company,van2],[tech,company,inactiveVan],
     [officeOnly,company,van1],[ungranted,company,van1],[other,otherCompany,van3]
   ])await db.query('insert into public.user_authorized_vans values($1,$2,$3)',[u,c,v])
   for(const [u,c,techCap,officeCap] of [
     [tech,company,true,false],[officeOnly,company,false,true],
     [ungranted,company,true,false],[other,otherCompany,true,false]
   ])await db.query('insert into public.user_access_capabilities values($1,$2,$3,$4)',[u,c,techCap,officeCap])
   for(const [u,c,issue,receive] of [
     [tech,company,false,true],[officeOnly,company,true,true],
     [ungranted,company,false,false],[other,otherCompany,false,true]
   ])await db.query('insert into public.user_warehouse_permissions values($1,$2,$3,$4)',[u,c,issue,receive])
   await db.query('insert into public.manager_operation_permissions values($1,$2,true,false,false,false)',[manager,company])
   await db.exec(await readFile(migration,'utf8'))

   const perm=(await db.query(`
     select
       has_function_privilege('authenticated','public.vanstock_warehouse_require_permission(text,uuid)','EXECUTE') as tech_can_call,
       has_function_privilege('anon','public.vanstock_warehouse_require_permission(text,uuid)','EXECUTE') as anon_cannot_call
   `)).rows[0]
   assert.equal(perm.tech_can_call,true)
   assert.equal(perm.anon_cannot_call,false)

   async function actor(idValue){
     await db.exec('reset role')
     await db.query("select set_config('test.user_id',$1,false)",[idValue])
     await db.exec('set role authenticated')
   }
   async function gate(action,van){return db.query('select public.vanstock_warehouse_require_permission($1,$2)',[action,van])}
   await t.test('technician can return stock from default and independently selected authorised alternate van',async()=>{
     await actor(tech)
     await gate('receive',van1)
     await gate('receive',van2)
   })
   await t.test('unassigned, other-company, inactive and missing vans are always rejected',async()=>{
     await actor(tech)
     for(const van of [van3,inactiveVan,null]){
       await assert.rejects(gate('receive',van),/authorised active van/)
     }
   })
   await t.test('a return grant does not permit a direct warehouse-to-van issue',async()=>{
     await actor(tech)
     await assert.rejects(gate('issue',van2),/Warehouse issue permission required/)
   })
   await t.test('Office-only role with stale Technician designation and grant is rejected',async()=>{
     await actor(officeOnly)
     await assert.rejects(gate('receive',van1),/Technician access required/)
   })
   await t.test('warehouse permissions cannot be inferred from an authorised van',async()=>{
     await actor(ungranted)
     await assert.rejects(gate('receive',van1),/Warehouse receive permission required/)
   })
   await t.test('Managers retain independent return grant, not stocktake or adjustments',async()=>{
     await actor(manager)
     await gate('receive',van2)
     await assert.rejects(gate('stocktake',null),/Manager permission required/)
     await assert.rejects(gate('adjust',null),/Manager permission required/)
   })
   await t.test('Administrator retains warehouse return permissions',async()=>{
     await actor(admin)
     await gate('receive',van2)
   })
   await t.test('other companies may only use their own assigned active vans',async()=>{
     await actor(other)
     await gate('receive',van3)
     await assert.rejects(gate('receive',van1),/authorised active van/)
   })
   await t.test('invalid action and unknown identity fail closed',async()=>{
     await actor(tech)
     await assert.rejects(gate('invented',van1),/Unknown warehouse operation/)
     await actor(id(999))
     await assert.rejects(gate('receive',van1),/Active login required/)
   })
 }finally{await db.exec('reset role').catch(()=>{});await db.close()}
})
