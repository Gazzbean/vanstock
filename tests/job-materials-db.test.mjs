import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

test('job materials are atomic, allocated with location and resolved without double-deduction',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''test.uid'',true),'''')::uuid';
   create table companies(id uuid primary key);
   create table profiles(id uuid primary key,company_id uuid,is_active boolean);
   create table vans(id uuid primary key,company_id uuid,active boolean);
   create table products(id uuid primary key);
   create table user_access_capabilities(user_id uuid,company_id uuid,technician_access boolean,office_access boolean);
   create table user_authorized_vans(user_id uuid,company_id uuid,van_id uuid);
   create table stock(van_id uuid,product_id uuid,quantity numeric,primary key(van_id,product_id));
   create table activity_log(type text,product_id uuid,quantity numeric);
   create function apply_van_stock_action(p_product_id uuid,p_operation text,p_quantity numeric,p_reference text,p_notes text,p_van uuid)
   returns numeric language plpgsql as $$ declare old_qty numeric; begin
    select quantity into old_qty from public.stock where van_id=p_van and product_id=p_product_id for update;
    if p_operation='issue' and (old_qty is null or old_qty<p_quantity) then raise exception 'Insufficient van stock'; end if;
    if p_operation='issue' then update public.stock set quantity=quantity-p_quantity where van_id=p_van and product_id=p_product_id;
    elsif p_operation='return' then update public.stock set quantity=quantity+p_quantity where van_id=p_van and product_id=p_product_id;
    else raise exception 'unsupported'; end if;
    insert into public.activity_log values(p_operation,p_product_id,p_quantity);
    return old_qty;
   end $$;`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261103130000_job_material_allocations.sql',import.meta.url),'utf8'))
  const ids=Array.from({length:5},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
  const [company,user,van,part,ties]=ids
  await db.query('insert into companies values($1)',[company]);await db.query('insert into profiles values($1,$2,true)',[user,company]);
  await db.query('insert into vans values($1,$2,true)',[van,company])
  await db.query('insert into products values($1),($2)',[part,ties])
  await db.query('insert into user_access_capabilities values($1,$2,true,false)',[user,company])
  await db.query('insert into user_authorized_vans values($1,$2,$3)',[user,company,van])
  await db.query('insert into stock values($1,$2,2),($1,$3,500)',[van,part,ties])
  await db.query("select set_config('test.uid',$1,false)",[user])
  await t.test('multi-line materials used deduct each once',async()=>{
   await db.query("select record_job_materials($1,'JOB-1',$2::jsonb,'used')",[van,JSON.stringify([{product_id:part,quantity:1},{product_id:ties,quantity:20}])])
   const rows=(await db.query('select product_id,quantity from stock')).rows
   assert.equal(Number(rows.find(x=>x.product_id===part).quantity),1)
   assert.equal(Number(rows.find(x=>x.product_id===ties).quantity),480)
  })
  await t.test('insufficient second line rolls back first line and audit',async()=>{
   const prior=Number((await db.query('select count(*) as n from activity_log')).rows[0].n)
   await assert.rejects(db.query("select record_job_materials($1,'JOB-2',$2::jsonb,'used')",[van,JSON.stringify([{product_id:part,quantity:1},{product_id:ties,quantity:999}])]),/Insufficient van stock/)
   assert.equal(Number((await db.query('select quantity from stock where product_id=$1',[part])).rows[0].quantity),1)
   assert.equal(Number((await db.query('select count(*) as n from activity_log')).rows[0].n),prior)
  })
  await t.test('allocation requires location and reason',async()=>{
   await assert.rejects(db.query("select record_job_materials($1,'JOB-3',$2::jsonb,'allocated')",[van,JSON.stringify([{product_id:ties,quantity:50}])]),/Site location and reason/)
  })
  await t.test('allocate and mark used does not debit twice',async()=>{
   await db.query("select record_job_materials($1,'JOB-3',$2::jsonb,'allocated','Plant room AHU-03','Awaiting shutdown')",[van,JSON.stringify([{product_id:ties,quantity:50}])])
   const allocation=(await db.query('select id,site_location,reason from job_material_allocations')).rows[0]
   assert.equal(allocation.site_location,'Plant room AHU-03')
   assert.equal(allocation.reason,'Awaiting shutdown')
   assert.equal(Number((await db.query('select quantity from stock where product_id=$1',[ties])).rows[0].quantity),430)
   await db.query("select resolve_job_material_allocation($1,'used')",[allocation.id])
   assert.equal(Number((await db.query('select quantity from stock where product_id=$1',[ties])).rows[0].quantity),430)
   await assert.rejects(db.query("select resolve_job_material_allocation($1,'returned')",[allocation.id]),/Allocation not open/)
  })
  await t.test('unused allocation returns stock once',async()=>{
   await db.query("select record_job_materials($1,'JOB-4',$2::jsonb,'allocated','Store A','Deferred work')",[van,JSON.stringify([{product_id:ties,quantity:10}])])
   const allocation=(await db.query("select id from job_material_allocations where job_reference='JOB-4'")).rows[0]
   await db.query("select resolve_job_material_allocation($1,'returned')",[allocation.id])
   assert.equal(Number((await db.query('select quantity from stock where product_id=$1',[ties])).rows[0].quantity),430)
  })
  await t.test('unsigned clients cannot write allocation rows',async()=>{
   await db.exec('set role authenticated')
   await assert.rejects(db.query('delete from job_material_allocations'),/permission denied/)
   await db.exec('reset role')
  })
 }finally{await db.close()}
})
