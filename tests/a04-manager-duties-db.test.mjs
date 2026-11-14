import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const base=new URL('../supabase/migrations/20261103060000_warehouse_replenishment_requests.sql',import.meta.url)
const inventory=new URL('../supabase/migrations/20261030_warehouse_inventory_stage.sql',import.meta.url)
const dual=new URL('../supabase/migrations/20261107080000_warehouse_two_confirmations.sql',import.meta.url)
const managerPermissions=new URL('../supabase/migrations/20261109090000_manager_operation_permissions.sql',import.meta.url)
const managerGate=new URL('../supabase/migrations/20261109100000_enforce_manager_warehouse_permissions.sql',import.meta.url)
const discrepancies=new URL('../supabase/migrations/20261109110000_warehouse_receipt_discrepancies.sql',import.meta.url)
const commitments=new URL('../supabase/migrations/20261114160000_a03_warehouse_stock_commitments.sql',import.meta.url)
const duties=new URL('../supabase/migrations/20261114170000_a04_manager_duty_separation.sql',import.meta.url)
const ids={company:'00000000-0000-4000-8000-000000000001',warehouse:'00000000-0000-4000-8000-000000000002',
 van:'00000000-0000-4000-8000-000000000003',product:'00000000-0000-4000-8000-000000000004',
 manager:'00000000-0000-4000-8000-000000000005',receiver:'00000000-0000-4000-8000-000000000006',
 outsider:'00000000-0000-4000-8000-000000000007'}

test('A04 manager duties preserve existing receiving and committed-stock controls',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create role anon;create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as
     'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
   create table companies(id uuid primary key);
   create table profiles(id uuid primary key,company_id uuid,role text,van_id uuid,is_active boolean);
   create table vans(id uuid primary key,company_id uuid,van_number text,active boolean default true);
   create table products(id uuid primary key,company_id uuid,name text,stock_unit text,archived_at timestamptz,min_stock numeric);
   create table user_authorized_vans(user_id uuid,van_id uuid);
   create table user_warehouse_permissions(user_id uuid,company_id uuid,can_request boolean,can_issue boolean,can_receive boolean);
   create table stock(van_id uuid,product_id uuid,quantity numeric,updated_at timestamptz,primary key(van_id,product_id));
   create table activity_log(id bigint generated always as identity primary key,company_id uuid,van_id uuid,
     user_id uuid,product_id uuid,product_name text,type text,quantity numeric,reference text,notes text);
   create table warehouse_notifications(id uuid primary key default gen_random_uuid(),company_id uuid,
     user_id uuid,request_id uuid,event_type text,created_at timestamptz default now(),
     unique(user_id,request_id,event_type),constraint warehouse_notifications_event_type_check
       check(event_type in ('requested','approved','rejected','fulfilled')));
   create table user_access_capabilities(user_id uuid,company_id uuid,office_access boolean,technician_access boolean);
   create function public.adjust_warehouse_stock(uuid,uuid,text,numeric,text) returns numeric language sql as 'select 1::numeric';
   create function public.post_warehouse_opening_stock(uuid,uuid,numeric,text) returns void language plpgsql as $f$begin null;end;$f$;
   create function public.vanstock_next_stock_reference(text) returns text language sql as 'select ''TEST''::text';
  `)
  await db.query('insert into companies values($1)',[ids.company])
  await db.query("insert into profiles values($1,$4,'manager',null,true),($2,$4,'technician',$5,true),($3,$4,'technician',null,true)",
   [ids.manager,ids.receiver,ids.outsider,ids.company,ids.van])
  await db.query("insert into vans(id,company_id,van_number) values($1,$2,'Van #3')",[ids.van,ids.company])
  await db.query("insert into products values($1,$2,'Cable ties','ea',null,2)",[ids.product,ids.company])
  await db.query('insert into user_warehouse_permissions values($1,$2,true,false,false)',[ids.receiver,ids.company])
  await db.query('insert into user_access_capabilities values($1,$3,false,true),($2,$3,false,true)',[ids.receiver,ids.outsider,ids.company])
  await db.exec(await readFile(inventory,'utf8'))
  await db.query("insert into warehouses(id,company_id,name) values($1,$2,'Warehouse')",[ids.warehouse,ids.company])
  await db.query('insert into warehouse_stock(warehouse_id,product_id,quantity) values($1,$2,500)',[ids.warehouse,ids.product])
  await db.exec(await readFile(base,'utf8'))
  await db.exec(await readFile(dual,'utf8'))
  await db.exec(await readFile(managerPermissions,'utf8'))
  await db.exec(await readFile(managerGate,'utf8'))
  await db.exec(await readFile(discrepancies,'utf8'))
  await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
  const request=(await db.query('select create_warehouse_replenishment_request($1,$2,$3,5,$4) as id',
   [ids.warehouse,ids.van,ids.product,'JOB-123'])).rows[0].id
  await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
  await db.query('update manager_operation_permissions set approve_requests=false where user_id=$1',[ids.manager])
  await t.test('Manager cannot approve without saved grant',async()=>{
   await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'approve')",[request]),/permission required to review/)
   assert.equal((await db.query('select status from warehouse_replenishment_requests where id=$1',[request])).rows[0].status,'pending')
  })
  await db.query('update manager_operation_permissions set approve_requests=true,issue_warehouse=false where user_id=$1',[ids.manager])
  await db.query("select process_warehouse_replenishment_request($1,'approve')",[request])
  await t.test('Manager cannot issue without saved grant',async()=>{
   await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'fulfil')",[request]),/permission required to issue/)
  })
  await db.query('update manager_operation_permissions set issue_warehouse=true where user_id=$1',[ids.manager])
  await db.query("select process_warehouse_replenishment_request($1,'fulfil')",[request])
  await t.test('warehouse issue changes only the status',async()=>{
   assert.equal((await db.query('select status from warehouse_replenishment_requests where id=$1',[request])).rows[0].status,'issued')
   assert.equal(Number((await db.query('select quantity from warehouse_stock')).rows[0].quantity),500)
   assert.equal((await db.query('select count(*)::int as n from stock')).rows[0].n,0)
   await assert.rejects(db.query("select process_warehouse_replenishment_request($1,'fulfil')",[request]),/Only approved/)
  })
  // Simulate an in-flight issue during deployment. The new column must backfill
  // the full outstanding issue before any further warehouse action.
  await db.exec(await readFile(commitments,'utf8'))
  await db.exec(await readFile(duties,'utf8'))
  await db.exec(`create function public.vanstock_warehouse_opening_stock(uuid,uuid,numeric,text) returns void language plpgsql as $f$ begin perform public.vanstock_warehouse_require_permission('stocktake'); end; $f$;`)
  await t.test('migration backfills outstanding issued stock',async()=>{
    const wh=(await db.query('select quantity,committed_quantity from warehouse_stock')).rows[0]
    assert.equal(Number(wh.quantity),500)
    assert.equal(Number(wh.committed_quantity),5)
  })
  await db.query("select set_config('test.user_id',$1,false)",[ids.outsider])
  await t.test('unassigned technician cannot confirm another van',async()=>{
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[request]),/not authorised/)
  })
  await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
  await t.test('receiving discrepancy blocks stock movement until warehouse reconciliation',async()=>{
   await db.query('select report_warehouse_receipt_discrepancy($1,3,$2)',[request,'Two units missing from package'])
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[request]),/Outstanding receipt discrepancy/)
   const wh=(await db.query('select quantity,committed_quantity from warehouse_stock')).rows[0]
   assert.equal(Number(wh.quantity),500)
   assert.equal(Number(wh.committed_quantity),5)
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   await db.query('select resolve_warehouse_receipt_discrepancy($1,$2)',[request,'Two missing units physically located and delivered'])
   await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
  })
  await db.query('select confirm_warehouse_replenishment_receipt($1)',[request])
  await t.test('receipt moves the stock once and records the receiver',async()=>{
   const wh=(await db.query('select quantity,committed_quantity from warehouse_stock')).rows[0]
   assert.equal(Number(wh.quantity),495)
   assert.equal(Number(wh.committed_quantity),0)
   assert.equal(Number((await db.query('select quantity from stock')).rows[0].quantity),5)
   const row=(await db.query('select status,issued_by,received_by from warehouse_replenishment_requests where id=$1',[request])).rows[0]
   assert.equal(row.status,'fulfilled')
   assert.equal(row.issued_by,ids.manager)
   assert.equal(row.received_by,ids.receiver)
   assert.equal((await db.query('select count(*)::int as n from activity_log')).rows[0].n,1)
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[request]),/already recorded/)
   assert.equal(Number((await db.query('select quantity from stock')).rows[0].quantity),5)
  })
  // Exactly one unit is available. Separate approved requests must not be
  // issued against the same unit. All quantities are test-fixture only.
  await t.test('one available unit cannot be dispatched twice',async()=>{
   await db.query('update warehouse_stock set quantity=1')
   await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
   const make=async ref=>(await db.query(
     'select create_warehouse_replenishment_request($1,$2,$3,1,$4) as id',
     [ids.warehouse,ids.van,ids.product,ref])).rows[0].id
   const first=await make('A03-ONE')
   const second=await make('A03-TWO')
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   await db.query("select process_warehouse_replenishment_request($1,'approve')",[first])
   await db.query("select process_warehouse_replenishment_request($1,'approve')",[second])
   await db.query("select process_warehouse_replenishment_request($1,'fulfil')",[first])
   const wh=(await db.query('select quantity,committed_quantity from warehouse_stock')).rows[0]
   assert.equal(Number(wh.quantity),1)
   assert.equal(Number(wh.committed_quantity),1)
   await assert.rejects(db.query(
     "select process_warehouse_replenishment_request($1,'fulfil')",[second]),/Insufficient available warehouse stock/)
   assert.equal((await db.query('select status from warehouse_replenishment_requests where id=$1',[second])).rows[0].status,'approved')
   await assert.rejects(db.query(
      'update warehouse_stock set quantity=0'),/warehouse_committed_quantity_valid/)
   const after=(await db.query('select quantity,committed_quantity from warehouse_stock')).rows[0]
   assert.equal(Number(after.quantity),1)
   assert.equal(Number(after.committed_quantity),1)

   await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
   await db.query('select report_warehouse_receipt_discrepancy($1,0,$2)',
      [first,'Entire one-unit delivery missing'])
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[first]),
      /Outstanding receipt discrepancy/)
   assert.equal(Number((await db.query('select committed_quantity from warehouse_stock')).rows[0].committed_quantity),1)
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   await db.query('select resolve_warehouse_receipt_discrepancy($1,$2)',
      [first,'Missing unit recovered and physically delivered to receiving van'])
   await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
   await db.query('select confirm_warehouse_replenishment_receipt($1)',[first])
   const final=(await db.query('select quantity,committed_quantity from warehouse_stock')).rows[0]
   assert.equal(Number(final.quantity),0)
   assert.equal(Number(final.committed_quantity),0)
   assert.equal(Number((await db.query('select quantity from stock')).rows[0].quantity),6)
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[first]),/already recorded/)
   assert.equal((await db.query('select count(*)::int n from activity_log')).rows[0].n,2)

  })
  await t.test('previous return and adjustment grants do not imply receipt or stocktake grants',async()=>{
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   const g=(await db.query('select receive_returns,confirm_van_receipt,adjust_stock,stocktake_warehouse from manager_operation_permissions where user_id=$1',[ids.manager])).rows[0]
   assert.deepEqual(g,{receive_returns:true,confirm_van_receipt:false,adjust_stock:true,stocktake_warehouse:false})
   await db.query('select vanstock_warehouse_require_permission($1,$2)',['receive',ids.van])
   await assert.rejects(db.query('select vanstock_warehouse_require_permission($1)',['stocktake']),/Manager permission required/)
   await assert.rejects(db.query('select vanstock_warehouse_adjust($1,$2,$3,$4,$5)',[ids.warehouse,ids.product,'set',1,'test']),/Manager permission required/)
   await db.query('select vanstock_warehouse_adjust($1,$2,$3,$4,$5)',[ids.warehouse,ids.product,'add',1,'test'])
  })
  await t.test('Manager cannot confirm issued goods via return grant, but new grant permits it',async()=>{
   await db.query('update warehouse_stock set quantity=10,committed_quantity=0')
   await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
   const req=(await db.query('select create_warehouse_replenishment_request($1,$2,$3,1,$4) id',[ids.warehouse,ids.van,ids.product,'A04-MGR'])).rows[0].id
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   await db.query("select process_warehouse_replenishment_request($1,'approve')",[req])
   await db.query("select process_warehouse_replenishment_request($1,'fulfil')",[req])
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[req]),/Manager permission required to confirm van receipt/)
   assert.equal(Number((await db.query('select committed_quantity from warehouse_stock')).rows[0].committed_quantity),1)
   await db.query('update manager_operation_permissions set confirm_van_receipt=true where user_id=$1',[ids.manager])
   await db.query('select confirm_warehouse_replenishment_receipt($1)',[req])
   assert.equal(Number((await db.query('select committed_quantity from warehouse_stock')).rows[0].committed_quantity),0)
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[req]),/already recorded/)
  })
  await t.test('Office-only profile cannot receive even with a Technician base role and historical van assignment',async()=>{
   const office='00000000-0000-4000-8000-000000000017'
   await db.query("insert into profiles(id,company_id,role,van_id,is_active) values($1,$2,'technician',$3,true)",[office,ids.company,ids.van])
   await db.query("insert into user_access_capabilities values($1,$2,true,false)",[office,ids.company])
   await db.query("insert into user_authorized_vans values($1,$2)",[office,ids.van])
   await db.query("select set_config('test.user_id',$1,false)",[office])
   await assert.rejects(db.query('select vanstock_warehouse_require_permission($1,$2)',['receive',ids.van]),
      /Technician access required/)
   await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
   const req=(await db.query('select create_warehouse_replenishment_request($1,$2,$3,1,$4) id',
     [ids.warehouse,ids.van,ids.product,'A04-OFFICE-CHECK'])).rows[0].id
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   await db.query("select process_warehouse_replenishment_request($1,'approve')",[req])
   await db.query("select process_warehouse_replenishment_request($1,'fulfil')",[req])
   await db.query("select set_config('test.user_id',$1,false)",[office])
   await assert.rejects(db.query('select confirm_warehouse_replenishment_receipt($1)',[req]),
      /not authorised to receive/)
   await assert.rejects(db.query('select report_warehouse_receipt_discrepancy($1,0,$2)',[req,'No items received']),
      /Not authorised for the receiving van/)
   await db.query("select set_config('test.user_id',$1,false)",[ids.receiver])
   await db.query('select confirm_warehouse_replenishment_receipt($1)',[req])
  })
  await t.test('New stocktake grant does not restore disabled warehouse returns',async()=>{
   await db.query('update manager_operation_permissions set receive_returns=false,stocktake_warehouse=true where user_id=$1',[ids.manager])
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   await assert.rejects(db.query('select vanstock_warehouse_require_permission($1,$2)',['receive',ids.van]),/Manager permission required for warehouse receive/)
   await db.query('select vanstock_warehouse_opening_stock($1,$2,1,$3)',[ids.warehouse,ids.product,'A04-count'])
   await db.query('select vanstock_warehouse_adjust($1,$2,$3,1,$4)',[ids.warehouse,ids.product,'set','A04-count'])
   assert.equal((await db.query("select vanstock_manager_has_permission('confirm_van_receipt') as allowed")).rows[0].allowed,true)
  })
  await t.test('Only Administrator may save eight grants, with audit history and legacy setter removed',async()=>{
   const admin='00000000-0000-4000-8000-000000000018'
   await db.query("insert into profiles(id,company_id,role,van_id,is_active) values($1,$2,'admin',null,true)",[admin,ids.company])
   const setter=()=>db.query('select set_manager_operation_permissions($1,$2,$3,$4,$5,$6,$7,$8,$9)',[ids.manager,true,false,false,false,false,false,true,true])
   await db.query("select set_config('test.user_id',$1,false)",[ids.manager])
   await assert.rejects(setter(),/Administrator permission required/)
   await db.query("select set_config('test.user_id',$1,false)",[admin])
   await setter()
   const g=(await db.query('select receive_returns,confirm_van_receipt,stocktake_warehouse,issue_warehouse from manager_operation_permissions where user_id=$1',[ids.manager])).rows[0]
   assert.deepEqual(g,{receive_returns:false,confirm_van_receipt:true,stocktake_warehouse:true,issue_warehouse:false})
   const audit=(await db.query('select new_permissions from manager_permission_audit where user_id=$1 order by changed_at desc limit 1',[ids.manager])).rows[0].new_permissions
   assert.equal(audit.confirm_van_receipt,true)
   assert.equal(audit.stocktake_warehouse,true)
   assert.equal((await db.query("select to_regprocedure('public.set_manager_operation_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean)') prior")).rows[0].prior,null)
  })
 }finally{await db.close()}
})
