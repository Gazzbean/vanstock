import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const refs=new URL('../supabase/migrations/20261106090000_stock_movement_references.sql',import.meta.url)
const transfers=new URL('../supabase/migrations/20261106103000_van_to_van_approvals.sql',import.meta.url)
const ids={company:'00000000-0000-4000-8000-000000000001',otherCompany:'00000000-0000-4000-8000-000000000002',
 source:'00000000-0000-4000-8000-000000000011',destination:'00000000-0000-4000-8000-000000000012',
 product:'00000000-0000-4000-8000-000000000013',sender:'00000000-0000-4000-8000-000000000021',
 receiver:'00000000-0000-4000-8000-000000000022',admin:'00000000-0000-4000-8000-000000000023',
 outsider:'00000000-0000-4000-8000-000000000024'}

test('van transfer requests do not move stock; recipient confirms one atomic movement with audit',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table public.companies(id uuid primary key);
   create table public.vans(id uuid primary key,company_id uuid,active boolean,van_number text);
   create table public.products(id uuid primary key,company_id uuid,name text,stock_unit text,archived_at timestamptz);
   create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
   create table public.user_access_capabilities(user_id uuid,company_id uuid,office_access boolean);
   create table public.user_authorized_vans(user_id uuid,company_id uuid,van_id uuid);
   create table public.stock(van_id uuid,product_id uuid,quantity numeric,updated_at timestamptz,primary key(van_id,product_id));
   create table public.activity_log(company_id uuid,van_id uuid,user_id uuid,product_id uuid,product_name text,type text,quantity numeric,reference text,notes text);
  `)
  await db.exec(`
   insert into public.companies values ('${ids.company}'),('${ids.otherCompany}');
   insert into public.vans values
    ('${ids.source}','${ids.company}',true,'Van #3'),
    ('${ids.destination}','${ids.company}',true,'Van #4');
   insert into public.products values ('${ids.product}','${ids.company}','Cable ties','ea',null);
   insert into public.profiles values
    ('${ids.sender}','${ids.company}','technician',true),
    ('${ids.receiver}','${ids.company}','technician',true),
    ('${ids.admin}','${ids.company}','admin',true),
    ('${ids.outsider}','${ids.otherCompany}','technician',true);
   insert into public.user_access_capabilities values
    ('${ids.sender}','${ids.company}',false),
    ('${ids.receiver}','${ids.company}',false),
    ('${ids.admin}','${ids.company}',true),
    ('${ids.outsider}','${ids.otherCompany}',false);
   insert into public.user_authorized_vans values
    ('${ids.sender}','${ids.company}','${ids.source}'),
    ('${ids.receiver}','${ids.company}','${ids.destination}');
   insert into public.stock values ('${ids.source}','${ids.product}',20,now());
  `)
  await db.exec(await readFile(refs,'utf8'))
  await db.exec(await readFile(transfers,'utf8'))
  const login=async id=>db.exec(`select set_config('test.user_id','${id}',false)`)
  const balances=async()=>{const r=await db.query('select van_id,quantity from public.stock order by van_id');return r.rows.map(x=>Number(x.quantity))}
  const create=async(qty=5)=>{
   const r=await db.query('select public.vanstock_request_van_transfer($1,$2,$3,$4,$5) as id',
    [ids.source,ids.destination,ids.product,qty,'Requested for job 12345'])
   return r.rows[0].id
  }
  await login(ids.sender)
  const requestId=await create()
  assert.deepEqual(await balances(),[20],'request must not debit stock')
  await assert.rejects(()=>db.query('select public.vanstock_decide_van_transfer($1,true,null)',[requestId]),/Only the receiving van technician/)
  await login(ids.outsider)
  await assert.rejects(()=>db.query('select public.vanstock_decide_van_transfer($1,true,null)',[requestId]),/Transfer request not found/)
  await login(ids.receiver)
  const done=await db.query('select public.vanstock_decide_van_transfer($1,true,null) as reference',[requestId])
  assert.match(done.rows[0].reference,/^TRF-\d{8}-001$/)
  assert.deepEqual(await balances(),[15,5])
  await assert.rejects(()=>db.query('select public.vanstock_decide_van_transfer($1,true,null)',[requestId]),/already decided/)
  const log=await db.query('select type,reference,quantity from public.activity_log')
  assert.equal(log.rows.length,1)
  assert.equal(log.rows[0].reference,done.rows[0].reference)
  await login(ids.sender)
  const rejectedId=await create(2)
  await login(ids.receiver)
  await db.query('select public.vanstock_decide_van_transfer($1,false,$2)',[rejectedId,'Not requested by receiving van'])
  assert.deepEqual(await balances(),[15,5],'rejection must leave balances untouched')
  await login(ids.sender)
  const adminId=await create(2)
  await login(ids.admin)
  await assert.rejects(()=>db.query('select public.vanstock_decide_van_transfer($1,true,null)',[adminId]),/Management override requires an explanation/)
  const approved=await db.query('select public.vanstock_decide_van_transfer($1,true,$2) as reference',[adminId,'Receiver unavailable; manager verified collection'])
  assert.match(approved.rows[0].reference,/-002$/)
  assert.deepEqual(await balances(),[13,7])
 }finally{await db.close()}
})
