-- VanStock: READ-ONLY post-migration verification.
-- Run in an isolated Supabase TEST project AFTER applying all staged migrations.
-- Do not interpret schema inspection as proof of transactional correctness.

-- Expected: all three stock quantities and product minimum are numeric(12,2).
select table_name, column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'stock' and column_name = 'quantity')
    or (table_name = 'activity_log' and column_name = 'quantity')
    or (table_name = 'warehouse_stock' and column_name = 'quantity')
    or (table_name = 'warehouse_opening_entries' and column_name = 'opening_quantity')
    or (table_name = 'products' and column_name = 'min_stock')
  )
order by table_name, column_name;

-- Expected: stock_unit and archived_at columns exist on products.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'products'
  and column_name in ('stock_unit', 'archived_at')
order by column_name;

-- Expected: authenticated can EXECUTE approved RPCs; anonymous cannot.
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as signature,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'apply_van_stock_action',
    'move_warehouse_van_stock',
    'post_warehouse_opening_stock',
    'set_product_archived',
    'set_warehouse_user_permissions'
  )
order by p.proname, signature;

-- Expected: direct table INSERT/UPDATE/DELETE denied to authenticated.
select c.relname as table_name,
       has_table_privilege('authenticated',c.oid,'INSERT') as can_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') as can_update,
       has_table_privilege('authenticated',c.oid,'DELETE') as can_delete,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('stock','activity_log','warehouse_stock',
                    'warehouse_opening_entries','user_warehouse_permissions')
order by c.relname;

-- Expected: exactly one opening balance per warehouse/product and no negatives.
select warehouse_id, product_id, count(*) as entries
from public.warehouse_opening_entries
group by warehouse_id,product_id
having count(*) > 1;

select 'van_negative' as violation, count(*) as occurrences
from public.stock where quantity < 0
union all select 'warehouse_negative', count(*) from public.warehouse_stock where quantity < 0;

-- Still required separately: signed-in user tests, concurrency, rollback,
-- and actual debit/credit reconciliation. A green result here is not release approval.
