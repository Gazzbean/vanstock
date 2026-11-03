import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

test('vehicle register preserves history and enforces company-scoped uniqueness',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create table companies(id uuid primary key);
    create table vans(id uuid primary key,company_id uuid references companies(id),van_number text);`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261103080000_vehicle_register.sql',import.meta.url),'utf8'))
  const c1='00000000-0000-4000-8000-000000000001',c2='00000000-0000-4000-8000-000000000002'
  await db.query('insert into companies values($1),($2)',[c1,c2])
  await db.query("insert into vans(id,company_id,van_number,registration) values('00000000-0000-4000-8000-000000000003',$1,'Van #3','1ABC123')",[c1])
  await assert.rejects(db.query("insert into vans(id,company_id,van_number) values('00000000-0000-4000-8000-000000000004',$1,'van #3')",[c1]),/duplicate key/)
  await db.query("insert into vans(id,company_id,van_number,registration) values('00000000-0000-4000-8000-000000000005',$1,'Van #3','1ABC123')",[c2])
  await db.query('update vans set active=false where company_id=$1',[c1])
  assert.equal((await db.query('select active from vans where company_id=$1',[c1])).rows[0].active,false)
  assert.equal((await db.query('select active from vans where company_id=$1',[c2])).rows[0].active,true)
 }finally{await db.close()}
})

test('warehouse minimum is independently stored for each warehouse and product',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table companies(id uuid primary key);
    create table profiles(id uuid primary key,company_id uuid,role text);
    create table warehouses(id uuid primary key,company_id uuid);
    create table products(id uuid primary key,company_id uuid,min_stock numeric);`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261103081000_warehouse_stock_thresholds.sql',import.meta.url),'utf8'))
  const ids=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
  await db.query('insert into companies values($1)',[ids[0]])
  await db.query('insert into warehouses values($1,$2),($3,$2)',[ids[1],ids[0],ids[2]])
  await db.query('insert into products values($1,$2,5)',[ids[3],ids[0]])
  await db.query('insert into warehouse_stock_standards(company_id,warehouse_id,product_id,min_quantity,target_quantity) values($1,$2,$4,20,50),($1,$3,$4,100,200)',ids)
  const rows=(await db.query('select min_quantity from warehouse_stock_standards order by min_quantity')).rows
  assert.deepEqual(rows.map(x=>Number(x.min_quantity)),[20,100])
  assert.equal(Number((await db.query('select min_stock from products')).rows[0].min_stock),5)
  await assert.rejects(db.query('update warehouse_stock_standards set target_quantity=1'),/check constraint/)
 }finally{await db.close()}
})

test('extended catalogue CSV import is atomic and marks ServiceM8 links for review',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
    create table companies(id uuid primary key);
    create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
    create table products(id uuid primary key default gen_random_uuid(),company_id uuid,name text,category text,stock_unit text,min_stock numeric,unique(id,company_id));
    create table product_settings(product_id uuid primary key,company_id uuid,tracking_type text,servicem8_item_number text,servicem8_material_uuid text,mapping_status text);`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261103082000_catalogue_import_metadata.sql',import.meta.url),'utf8'))
  const company='00000000-0000-4000-8000-000000000001',manager='00000000-0000-4000-8000-000000000002'
  await db.query('insert into companies values($1)',[company])
  await db.query("insert into profiles values($1,$2,'manager',true)",[manager,company])
  await db.query("select set_config('test.user_id',$1,false)",[manager])
  const rows=[{name:'Cable Ties',category:'Consumable',stock_unit:'ea',min_stock:50,tracking_type:'bulk_consumable',servicem8_item_number:'CT500',supplier_name:'Airefrig',supplier_part_number:'AT500'},
    {name:'Copper Tube',category:'Tube',stock_unit:'m',min_stock:5.5,tracking_type:'stocked'}]
  const created=await db.query('select vanstock_import_catalogue_metadata($1::jsonb) as n',[JSON.stringify(rows)])
  assert.equal(created.rows[0].n,2)
  const settings=(await db.query('select tracking_type,mapping_status from product_settings order by tracking_type')).rows
  assert.deepEqual(settings.map(x=>x.mapping_status),['needs_review','unlinked'])
  assert.equal((await db.query('select supplier_name from product_import_supplier_hints')).rows[0].supplier_name,'Airefrig')
  const invalid=[{...rows[0],name:'Other cable ties'}, {...rows[1],name:'Invalid quantity',min_stock:2.345}]
  await assert.rejects(db.query('select vanstock_import_catalogue_metadata($1::jsonb)',[JSON.stringify(invalid)]),/Invalid product metadata/)
  assert.equal((await db.query('select count(*)::int as n from products')).rows[0].n,2,'failed batch must roll back every row')
 }finally{await db.close()}
})
