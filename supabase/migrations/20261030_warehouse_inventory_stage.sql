-- VanStock warehouse inventory: additive staging migration.
-- DO NOT RUN until permission migration has been reviewed/applied and production testing is planned.
-- Existing van stock in public.stock is preserved as-is.
-- Stock balances: public.warehouse_stock for warehouses; public.stock for vans.
-- Apply product UOM metadata migration BEFORE this staged migration.
-- This transitional model requires all movements through controlled RPC functions.
-- Before production, refactor the legacy adjustStock/recordTransfer write paths to the same atomic model.

begin;

-- Exact decimal balances preserve current integer values (e.g. 8 becomes 8.000).
-- Transaction logs must store the same precision as inventory.
alter table public.stock
  alter column quantity type numeric(12,2) using quantity::numeric(12,2);
alter table public.activity_log
  alter column quantity type numeric(12,2) using quantity::numeric(12,2);
alter table public.products
  alter column min_stock type numeric(12,2) using min_stock::numeric(12,2);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.warehouse_stock (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

alter table public.warehouses enable row level security;
alter table public.warehouse_stock enable row level security;
revoke all on public.warehouses, public.warehouse_stock from anon, authenticated;

-- One opening/default warehouse per company. No stock quantities are invented.
insert into public.warehouses (company_id, name)
select c.id, 'Main Warehouse'
from public.companies c
on conflict (company_id, name) do nothing;

-- All cross-location stock movements are performed within one PostgreSQL transaction.
create or replace function public.move_warehouse_van_stock(
  p_warehouse_id uuid,
  p_van_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_direction text,
  p_reference text default '',
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_assigned_van uuid;
  v_role text;
  v_van_label text;
  v_warehouse_label text;
  v_product_label text;
  v_perm_issue boolean;
  v_perm_receive boolean;
  v_previous numeric(12,2);
  v_unit text;
  v_archived timestamptz;
begin
  if v_user_id is null then raise exception 'Login required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
  -- Function argument is unscaled NUMERIC: validate BEFORE writing to NUMERIC(12,2) columns.
  if p_quantity <> trunc(p_quantity, 2) then
    raise exception 'Maximum two decimal places permitted';
  end if;
  if p_quantity >= 1000000000 then raise exception 'Quantity exceeds supported range'; end if;
  if p_direction not in ('warehouse-to-van', 'van-to-warehouse') or p_direction is null then
    raise exception 'Invalid movement direction';
  end if;

  select company_id, van_id, role
  into v_company_id, v_assigned_van, v_role
  from public.profiles where id = v_user_id;
  if v_company_id is null or v_role not in ('admin','manager','technician') then
    raise exception 'Account is not authorised';
  end if;

  -- Lock product FIRST to prevent an archive racing a stock movement.
  select name, stock_unit, archived_at
    into v_product_label, v_unit, v_archived
  from public.products
  where id = p_product_id and company_id = v_company_id for update;
  if v_product_label is null then raise exception 'Product not found for company'; end if;
  if v_archived is not null then raise exception 'Archived product cannot be moved'; end if;

  -- Explicit location and product tenancy verification.
  select name into v_warehouse_label from public.warehouses
  where id = p_warehouse_id and company_id = v_company_id;
  if v_warehouse_label is null then raise exception 'Warehouse not found for company'; end if;

  select van_number into v_van_label from public.vans
  where id = p_van_id and company_id = v_company_id;
  if v_van_label is null then raise exception 'Van not found for company'; end if;

  if v_unit not in ('ea','kg','m','pack','container') or v_unit is null then
    raise exception 'Unsupported product stock unit';
  end if;
  if v_unit in ('ea','pack','container') and p_quantity <> trunc(p_quantity) then
    raise exception 'This product must be moved in whole units';
  end if;

  if v_role = 'technician' then
    if v_assigned_van is distinct from p_van_id then
      raise exception 'Technicians may only replenish their assigned van';
    end if;
    select coalesce(can_issue,false), coalesce(can_receive,false)
      into v_perm_issue, v_perm_receive
      from public.user_warehouse_permissions where user_id = v_user_id
        and company_id = v_company_id;
    if p_direction = 'warehouse-to-van' and not coalesce(v_perm_issue,false) then
      raise exception 'Warehouse issue permission required';
    end if;
    if p_direction = 'van-to-warehouse' and not coalesce(v_perm_receive,false) then
      raise exception 'Warehouse receive permission required';
    end if;
  end if;

  -- Lock both location records in a fixed order so simultaneous transfers
  -- through this function cannot overwrite each other.
  perform 1 from public.warehouses where id = p_warehouse_id for update;
  perform 1 from public.vans where id = p_van_id for update;

  if p_direction = 'warehouse-to-van' then
    select quantity into v_previous from public.warehouse_stock
    where warehouse_id = p_warehouse_id and product_id = p_product_id for update;

    if v_previous is null or v_previous < p_quantity then
      raise exception 'Insufficient warehouse stock';
    end if;

    update public.warehouse_stock set quantity = quantity - p_quantity, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;

    insert into public.stock (van_id, product_id, quantity, updated_at)
    values (p_van_id, p_product_id, p_quantity, now())
    on conflict (van_id, product_id)
    do update set quantity = public.stock.quantity + excluded.quantity, updated_at = now();

  else
    select quantity into v_previous from public.stock
    where van_id = p_van_id and product_id = p_product_id for update;
    if v_previous is null or v_previous < p_quantity then
      raise exception 'Insufficient van stock';
    end if;

    update public.stock set quantity = quantity - p_quantity, updated_at = now()
    where van_id = p_van_id and product_id = p_product_id;

    insert into public.warehouse_stock (warehouse_id, product_id, quantity, updated_at)
    values (p_warehouse_id, p_product_id, p_quantity, now())
    on conflict (warehouse_id, product_id)
    do update set quantity = public.warehouse_stock.quantity + excluded.quantity, updated_at = now();
  end if;

  -- Store one warehouse-side and one van-side ledger entry together.
  -- Schema does not yet have warehouse_id in activity_log; readable references
  -- are included until the unified transaction ledger is introduced.
  insert into public.activity_log
    (company_id, van_id, user_id, product_id, product_name, type, quantity, reference, notes)
  values
    (v_company_id, null, v_user_id, p_product_id, v_product_label, p_direction,
      p_quantity, v_warehouse_label || ' / ' || v_van_label || ' / ' || coalesce(p_reference,''),
      'Warehouse ledger entry. ' || coalesce(p_notes,'')),
    (v_company_id, p_van_id, v_user_id, p_product_id, v_product_label, p_direction,
      p_quantity, v_warehouse_label || ' / ' || v_van_label || ' / ' || coalesce(p_reference,''),
      'Van ledger entry. ' || coalesce(p_notes,''));
end;
$function$;

revoke all on function public.move_warehouse_van_stock(uuid,uuid,uuid,numeric,text,text,text) from public, anon;
grant execute on function public.move_warehouse_van_stock(uuid,uuid,uuid,numeric,text,text,text) to authenticated;

commit;

-- No starting inventory is added by this migration.
-- Initial counts must be approved and entered using a separately audited stocktake workflow.
-- All legacy stock write operations and ledger reports must be migrated and tested
-- before this transaction function is enabled for use.
