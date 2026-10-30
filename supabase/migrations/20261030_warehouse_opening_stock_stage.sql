-- STAGED: one-time approved opening stock entry, per warehouse and product.
-- Apply AFTER product UOM, warehouse stock and decimal quantity migrations.
-- Not for the live Supabase project until backup, testing and approval.

begin;

create table if not exists public.warehouse_opening_entries (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  company_id uuid not null references public.companies(id),
  product_id uuid not null references public.products(id),
  opening_quantity numeric(12,3) not null check (opening_quantity >= 0),
  stocktake_reference text not null,
  approved_by uuid not null references public.profiles(id),
  posted_at timestamptz not null default now(),
  unique (warehouse_id, product_id)
);

alter table public.warehouse_opening_entries enable row level security;
revoke all on public.warehouse_opening_entries from anon, authenticated;

create or replace function public.post_warehouse_opening_stock(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_count numeric(12,3),
  p_stocktake_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_actor uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_unit text;
  v_product_name text;
  v_warehouse_name text;
  v_existing numeric(12,3);
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select company_id, role into v_company, v_role
  from public.profiles where id = v_actor;
  if v_company is null or v_role not in ('admin','manager') then
    raise exception 'Administrator or Manager required';
  end if;

  if p_count is null or p_count < 0 then
    raise exception 'Opening count must be zero or greater';
  end if;
  if p_stocktake_reference is null
      or length(trim(p_stocktake_reference)) = 0
      or length(p_stocktake_reference) > 500 then
    raise exception 'Approved stocktake reference required (up to 500 characters)';
  end if;

  select name into v_warehouse_name from public.warehouses
  where id = p_warehouse_id and company_id = v_company for update;
  if v_warehouse_name is null then raise exception 'Warehouse does not belong to company'; end if;

  select name, stock_unit into v_product_name, v_unit from public.products
  where id = p_product_id and company_id = v_company;
  if v_product_name is null then raise exception 'Product does not belong to company'; end if;
  if v_unit not in ('ea','kg','m','pack','container') or v_unit is null then
    raise exception 'Product unit must be verified first';
  end if;
  if v_unit in ('ea','pack','container') and p_count <> trunc(p_count) then
    raise exception 'Whole-number count required for this product';
  end if;

  -- A second attempt for this product, including an opening count of zero,
  -- is prohibited, preventing duplicate opening stock.
  if exists (
    select 1 from public.warehouse_opening_entries
    where warehouse_id = p_warehouse_id and product_id = p_product_id
  ) then
    raise exception 'Opening stock already posted for this warehouse/product';
  end if;

  select quantity into v_existing from public.warehouse_stock
  where warehouse_id = p_warehouse_id and product_id = p_product_id for update;
  if v_existing is not null then
    raise exception 'Warehouse balance already exists; use audited stock adjustment';
  end if;

  insert into public.warehouse_opening_entries
    (warehouse_id, company_id, product_id, opening_quantity,
     stocktake_reference, approved_by)
  values (p_warehouse_id, v_company, p_product_id, p_count,
    trim(p_stocktake_reference), v_actor);

  -- An explicit zero count still creates a balance row and a one-time marker.
  insert into public.warehouse_stock
    (warehouse_id, product_id, quantity, updated_at)
  values (p_warehouse_id, p_product_id, p_count, now());

  insert into public.activity_log
    (company_id, van_id, user_id, product_id, product_name,
     type, quantity, reference, notes)
  values
    (v_company, null, v_actor, p_product_id, v_product_name,
     'opening-stock', p_count, trim(p_stocktake_reference),
     'Approved opening count for warehouse: ' || v_warehouse_name);
end;
$body$;

revoke all on function public.post_warehouse_opening_stock(uuid,uuid,numeric,text)
  from public, anon;
grant execute on function public.post_warehouse_opening_stock(uuid,uuid,numeric,text)
  to authenticated;

commit;

-- No automatic stock entries are made by running this migration.
-- The opening-stock RPC requires explicit manager/admin action per product.
