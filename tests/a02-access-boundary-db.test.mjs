import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const migration=new URL('../supabase/migrations/20261114050000_a02_access_boundary_hardening.sql',import.meta.url)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('A02 migration enforces database permissions for synthetic company roles', async t=>{
 const db=new PGlite()
 try {
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean,van_id uuid);
    create table public.vans(id uuid primary key,company_id uuid,van_number text);
    create table public.user_authorized_vans(user_id uuid,company_id uuid,van_id uuid);
    create table public.user_access_capabilities(user_id uuid,company_id uuid,office_access boolean,technician_access boolean);
    create table public.products(id uuid primary key,company_id uuid,name text);
    create table public.stock(van_id uuid,product_id uuid,quantity numeric);
    create table public.activity_log(company_id uuid,van_id uuid,type text);
    create function public.my_company_id() returns uuid language sql stable security definer as
      'select company_id from public.profiles where id=auth.uid()';
    create function public.my_van_id() returns uuid language sql stable security definer as
      'select van_id from public.profiles where id=auth.uid()';
    alter table public.profiles enable row level security;
    alter table public.vans enable row level security;
    alter table public.user_access_capabilities enable row level security;
    alter table public.user_authorized_vans enable row level security;
    alter table public.products enable row level security;
    alter table public.stock enable row level security;
    alter table public.activity_log enable row level security;
    create policy "profiles read company" on public.profiles for select to public using(company_id=my_company_id());
    create policy "vans company" on public.vans for all to public using(company_id=my_company_id());
    create policy "stock read company" on public.stock for select to public
      using (van_id in (select v.id from public.vans v where v.company_id=my_company_id()));
    create policy "stock write own van" on public.stock for all to public using(van_id=my_van_id());
    create policy "log read company" on public.activity_log for select to public using(company_id=my_company_id());
    create policy "log insert" on public.activity_log for insert to public with check(company_id=my_company_id());
    create policy "products read" on public.products for select to public using(company_id=my_company_id());
    create policy "products write manager" on public.products for all to public using(
      company_id=my_company_id() and exists(
        select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin')
      ));
    create policy "capabilities own" on public.user_access_capabilities for select to authenticated
      using(user_id=auth.uid());
    create policy "assignments own" on public.user_authorized_vans for select to authenticated
      using(user_id=auth.uid());
    grant all on public.profiles,public.vans,public.products,public.stock,public.activity_log to anon,authenticated;
    grant select on public.user_authorized_vans,public.user_access_capabilities to authenticated;
    grant all on public.profiles,public.vans,public.products,public.stock,public.activity_log to service_role;
  `)
  const companyA=id(10),companyB=id(20),product=id(300)
  const people=[
   [id(1),companyA,'admin',true,id(101)],
   [id(2),companyA,'technician',true,null],
   [id(3),companyA,'manager',true,id(101)],
   [id(4),companyA,'technician',true,id(101)],
   [id(5),companyA,'manager',false,id(101)],
   [id(6),companyB,'admin',true,id(201)],
  ]
  for(const person of people)await db.query(
   'insert into public.profiles(id,company_id,role,is_active,van_id) values($1,$2,$3,$4,$5)',person)
  for(const [u,comp,office,tech] of [
   [id(1),companyA,true,true],[id(2),companyA,true,false],
   [id(3),companyA,false,true],[id(4),companyA,false,true],
   [id(5),companyA,false,true],[id(6),companyB,true,true]
  ])await db.query(
   'insert into public.user_access_capabilities values($1,$2,$3,$4)',[u,comp,office,tech])
  for(const [v,comp,name] of [
   [id(101),companyA,'Van A1'],[id(102),companyA,'Van A2'],
   [id(201),companyB,'Van B1']
  ])await db.query('insert into public.vans values($1,$2,$3)',[v,comp,name])
  for(const [u,comp,v] of [
   [id(1),companyA,id(101)],[id(3),companyA,id(101)],
   [id(4),companyA,id(101)],[id(5),companyA,id(101)],
   [id(6),companyB,id(201)]
  ])await db.query('insert into public.user_authorized_vans values($1,$2,$3)',[u,comp,v])
  for(const [v,q] of [[id(101),10],[id(102),15],[id(201),20]])
    await db.query('insert into public.stock values($1,$2,$3)',[v,product,q])
  for(const [comp,v,kind] of [
   [companyA,id(101),'receipt'],[companyA,id(102),'issue'],
   [companyA,null,'warehouse'],[companyB,id(201),'receipt']
  ])await db.query('insert into public.activity_log values($1,$2,$3)',[comp,v,kind])
  for(const [comp,name] of [[companyA,'A product'],[companyB,'B product']])
    await db.query('insert into public.products values($1,$2,$3)',[comp===companyA?id(301):id(302),comp,name])
  await db.exec(await readFile(migration,'utf8'))

  const permissions=(await db.query(`
    select
      has_table_privilege('authenticated','public.vans','SELECT') as can_read_vans,
      has_table_privilege('authenticated','public.vans','INSERT') as van_insert,
      has_table_privilege('authenticated','public.vans','UPDATE') as van_update,
      has_table_privilege('authenticated','public.vans','DELETE') as van_delete,
      has_table_privilege('authenticated','public.vans','TRUNCATE') as van_truncate,
      has_table_privilege('authenticated','public.products','UPDATE') as product_update,
      has_table_privilege('authenticated','public.stock','UPDATE') as stock_update,
      has_table_privilege('service_role','public.vans','UPDATE') as service_vehicle_update
  `)).rows[0]
  assert.equal(permissions.can_read_vans,true)
  for(const key of ['van_insert','van_update','van_delete','van_truncate','product_update','stock_update'])
    assert.equal(permissions[key],false,key)
  assert.equal(permissions.service_vehicle_update,true)

  async function simulate(role,user){
    await db.exec('reset role')
    await db.query("select set_config('test.user_id',$1,false)",[user??''])
    await db.exec('set role '+role)
    const result=(await db.query(`
      select
        (select count(*)::int from public.vans) as vans,
        (select count(*)::int from public.stock) as stock,
        (select count(*)::int from public.activity_log) as history,
        (select count(*)::int from public.products) as products
    `)).rows[0]
    return result
  }
  await t.test('administrator sees company-wide rows, never another company',async()=>{
    assert.deepEqual(await simulate('authenticated',id(1)),{vans:2,stock:2,history:3,products:1})
  })
  await t.test('Office account sees company fleet without a Technician capability',async()=>{
    assert.deepEqual(await simulate('authenticated',id(2)),{vans:2,stock:2,history:3,products:1})
  })
  await t.test('Manager/Technician without Office can see only explicitly assigned vans',async()=>{
    assert.deepEqual(await simulate('authenticated',id(3)),{vans:1,stock:1,history:1,products:1})
    assert.deepEqual(await simulate('authenticated',id(4)),{vans:1,stock:1,history:1,products:1})
  })
  await t.test('inactive identities have zero company or assigned-van access',async()=>{
    assert.deepEqual(await simulate('authenticated',id(5)),{vans:0,stock:0,history:0,products:0})
    assert.equal((await db.query('select my_company_id() as id')).rows[0].id,null)
  })
  await t.test('company isolation holds for users in other companies',async()=>{
    assert.deepEqual(await simulate('authenticated',id(6)),{vans:1,stock:1,history:1,products:1})
  })
  await t.test('anonymous browser session has no table read permissions',async()=>{
    await db.exec('reset role')
    await db.query("select set_config('test.user_id','',false)")
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.vans'),/permission denied/)
    await assert.rejects(db.query('select * from public.stock'),/permission denied/)
  })
  await t.test('authenticated users cannot directly edit vehicles or products',async()=>{
    await simulate('authenticated',id(3))
    await assert.rejects(db.query('update public.vans set van_number=$1 where id=$2',['Tampered',id(101)]),/permission denied/)
    await assert.rejects(db.query('delete from public.vans where id=$1',[id(101)]),/permission denied/)
    await assert.rejects(db.query('update public.products set name=$1 where id=$2',['Tampered',id(301)]),/permission denied/)
  })
 }finally{await db.exec('reset role').catch(()=>{});await db.close()}
})
