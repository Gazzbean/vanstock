-- VanStock: READ ONLY staging preflight.
-- Safe to run in Supabase SQL Editor: SELECT only, no database changes.
-- Compare results with staged migration prerequisites before proceeding.

-- Core tables and quantity column types
select table_name, column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name in ('products','profiles','companies','vans','stock','activity_log',
                     'warehouses','warehouse_stock','user_warehouse_permissions')
  and column_name in ('id','company_id','van_id','product_id','quantity','min_stock',
                      'stock_unit','role')
order by table_name, ordinal_position;

-- Table counts: existing records must be reconciled before a conversion.
select 'companies' as object, count(*)::bigint as records from public.companies
union all select 'vans', count(*) from public.vans
union all select 'products', count(*) from public.products
union all select 'profiles', count(*) from public.profiles
union all select 'stock', count(*) from public.stock
union all select 'activity_log', count(*) from public.activity_log;

-- Existing negative stock, if any, must be resolved before constraints.
select count(*) as negative_van_stock_rows
from public.stock
where quantity < 0;

-- Existing duplicates or missing references in stock.
select van_id, product_id, count(*) as duplicate_count
from public.stock
group by van_id, product_id
having count(*) > 1;

-- Confirm relevant user grants without changing them.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles','stock','activity_log','products')
  and grantee in ('anon','authenticated','service_role')
order by table_name, grantee, privilege_type;

-- Do NOT paste or execute original supabase-schema.sql seed script on an existing project.
