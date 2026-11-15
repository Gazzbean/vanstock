-- A11: READ ONLY release preflight – no DDL/DML.
-- Confirm Supabase project/connection identity externally before running.
-- These result sets contain counts and grants, not private credentials.
select current_timestamp as checked_utc,
 (select count(*) from public.products where archived_at is null) active_products,
 (select count(*) from public.vans where active=true) active_vans,
 (select count(*) from public.warehouses) warehouses,
 (select count(*) from public.stock) van_balance_rows,
 (select count(*) from public.warehouse_stock) warehouse_balance_rows,
 (select count(*) from public.activity_log) stock_activity_records,
 (select count(*) from public.warehouse_replenishment_requests) replenishment_requests,
 (select count(*) from public.warehouse_replenishment_requests where status in ('pending','approved','issued')) open_requests,
 (select count(*) from public.warehouse_notifications) notifications,
 (select count(*) from public.job_material_allocations where status='on_site') unresolved_site_allocations,
 (select count(*) from public.cylinder_custody) registered_cylinders,
 (select count(*) from public.cylinder_custody_events) custody_events,
 (select count(*) from public.stock where quantity<0) negative_van_balances,
 (select count(*) from public.warehouse_stock where quantity<0 or committed_quantity<0 or committed_quantity>quantity) invalid_warehouse_balances;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_executable,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_executable,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_role_executable
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('vanstock_block_disputed_receipt','vanstock_enforce_manager_request_transition')
order by p.proname;

select c.relname as table_name,c.relrowsecurity as rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') anon_select,
 has_table_privilege('authenticated',c.oid,'INSERT') authenticated_insert
from pg_class c where c.oid in (
 'public.cylinder_custody'::regclass,'public.cylinder_custody_events'::regclass,
 'public.job_material_allocations'::regclass)
order by c.relname;

select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and indexname in
 ('warehouse_requests_company_status_created','warehouse_notifications_visible_idx',
  'job_allocations_company_status','cylinder_custody_company_status')
order by indexname;
