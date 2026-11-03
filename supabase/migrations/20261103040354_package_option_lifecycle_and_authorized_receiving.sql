-- Package descriptions are catalogue choices, not historical receipt records.
-- Retire an incorrect option without deleting receipts that used it.
alter table public.supplier_product_options
  add column if not exists active boolean not null default true;

create unique index if not exists supplier_product_active_option_name_unique
  on public.supplier_product_options
  (company_id, supplier_id, product_id, lower(btrim(package_label)), purchase_unit)
  where active = true;

-- A used package remains linked to its original immutable receipt snapshot.
-- The Admin UI may disable an option; receiving must refuse disabled options.
create or replace function public.vanstock_require_active_receipt_option()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.supplier_product_options option
    where option.id = new.supplier_option_id
      and option.company_id = new.company_id and option.active = true
  ) then
    raise exception 'This supplier package is retired; select an active package';
  end if;
  return new;
end;
$$;

drop trigger if exists pack_receipt_active_option_guard on public.pack_receipts;
create trigger pack_receipt_active_option_guard
before insert on public.pack_receipts
for each row execute function public.vanstock_require_active_receipt_option();

revoke execute on function public.vanstock_require_active_receipt_option()
  from public, anon, authenticated;

-- Receiving into an authorised temporary Working Van must use the same
-- per-user van assignments as issuing stock. Office users retain company-wide
-- receiving access. Both functions remain atomic and preserve receipt snapshots.
create or replace function public.receive_supplier_pack(
  p_receipt_id uuid, p_option_id uuid, p_packs numeric, p_docket text,
  p_destination_type text, p_destination_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_company uuid;
  v_supplier uuid;
  v_product uuid;
  v_unit text;
  v_archived timestamptz;
  v_per_pack numeric;
  v_qty numeric;
  v_existing public.pack_receipts%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id into v_company from public.profiles
    where id=v_uid and is_active=true;
  if v_company is null or not exists (
    select 1 from public.user_access_capabilities cap
    where cap.user_id=v_uid and cap.company_id=v_company and cap.receive_stock=true
  ) then raise exception 'Not authorised'; end if;
  if p_receipt_id is null or p_option_id is null or p_destination_id is null
    or p_destination_type not in ('van','warehouse')
    or p_packs is null or p_packs<=0 or p_packs>=1000000000
    or p_packs<>trunc(p_packs)
    or p_docket is null or length(btrim(p_docket)) not between 1 and 120
  then raise exception 'Invalid supplier receipt'; end if;

  select * into v_existing from public.pack_receipts where id=p_receipt_id;
  if found then
    if v_existing.company_id=v_company and v_existing.supplier_option_id=p_option_id
      and v_existing.packs=p_packs and v_existing.docket=btrim(p_docket)
      and v_existing.destination_type=p_destination_type
      and coalesce(v_existing.van_id,v_existing.warehouse_id)=p_destination_id
    then return v_existing.stock_quantity; end if;
    raise exception 'Receipt identifier already used';
  end if;

  select option.supplier_id,option.product_id,option.units_per_package,
    product.stock_unit,product.archived_at
    into v_supplier,v_product,v_per_pack,v_unit,v_archived
  from public.supplier_product_options option
  join public.products product on product.id=option.product_id and product.company_id=option.company_id
  join public.suppliers supplier on supplier.id=option.supplier_id and supplier.company_id=option.company_id
  where option.id=p_option_id and option.company_id=v_company
    and option.active=true and supplier.active=true
  for update of product;
  if v_product is null or v_archived is not null then
    raise exception 'Invalid active supplier package';
  end if;
  v_qty:=p_packs*v_per_pack;
  if v_qty<=0 or v_qty>=1000000000 or v_qty<>trunc(v_qty,2) then
    raise exception 'Unsupported converted stock quantity';
  end if;
  if v_unit in ('ea','pack','container') and v_qty<>trunc(v_qty) then
    raise exception 'Whole number stock quantity required';
  end if;

  if p_destination_type='van' then
    if not exists (
      select 1 from public.user_access_capabilities cap
      where cap.user_id=v_uid and cap.company_id=v_company and cap.office_access=true
    ) and not exists (
      select 1 from public.user_authorized_vans av
      where av.user_id=v_uid and av.company_id=v_company and av.van_id=p_destination_id
    ) then raise exception 'Only authorised van receipts permitted'; end if;
    perform 1 from public.vans where id=p_destination_id and company_id=v_company for update;
    if not found then raise exception 'Invalid van'; end if;
    insert into public.stock(van_id,product_id,quantity,updated_at)
      values(p_destination_id,v_product,v_qty,now())
      on conflict(van_id,product_id) do update
      set quantity=public.stock.quantity+excluded.quantity,updated_at=now();
  else
    if not exists (
      select 1 from public.user_access_capabilities cap
      where cap.user_id=v_uid and cap.company_id=v_company and cap.office_access=true
    ) then raise exception 'Warehouse receiving requires office access'; end if;
    perform 1 from public.warehouses where id=p_destination_id and company_id=v_company for update;
    if not found then raise exception 'Invalid warehouse'; end if;
    insert into public.warehouse_stock(warehouse_id,product_id,quantity,updated_at)
      values(p_destination_id,v_product,v_qty,now())
      on conflict(warehouse_id,product_id) do update
      set quantity=public.warehouse_stock.quantity+excluded.quantity,updated_at=now();
  end if;

  insert into public.pack_receipts(
    id,company_id,supplier_option_id,product_id,supplier_id,destination_type,
    van_id,warehouse_id,packs,units_per_package,stock_quantity,docket,received_by
  ) values (
    p_receipt_id,v_company,p_option_id,v_product,v_supplier,p_destination_type,
    case when p_destination_type='van' then p_destination_id end,
    case when p_destination_type='warehouse' then p_destination_id end,
    p_packs,v_per_pack,v_qty,btrim(p_docket),v_uid
  );
  return v_qty;
end;
$$;

create or replace function public.receive_loose_item(
  p_receipt_id uuid,p_product_id uuid,p_supplier_id uuid,p_quantity numeric,
  p_docket text,p_destination_type text,p_destination_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_company uuid;
  v_unit text;
  v_archived timestamptz;
  v_prior public.loose_item_receipts%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id into v_company from public.profiles where id=v_uid and is_active=true;
  if v_company is null or not exists (
    select 1 from public.user_access_capabilities cap
    where cap.user_id=v_uid and cap.company_id=v_company and cap.receive_stock=true
  ) then raise exception 'Not authorised'; end if;
  if p_receipt_id is null or p_product_id is null or p_supplier_id is null or p_destination_id is null
    or p_destination_type not in ('van','warehouse') or p_quantity is null or p_quantity<=0
    or p_quantity>=1000000000 or p_quantity<>trunc(p_quantity,2)
    or p_docket is null or length(btrim(p_docket)) not between 1 and 120
  then raise exception 'Invalid receipt'; end if;

  select * into v_prior from public.loose_item_receipts where id=p_receipt_id;
  if found then
    if v_prior.company_id=v_company and v_prior.product_id=p_product_id
      and v_prior.supplier_id=p_supplier_id and v_prior.quantity=p_quantity
      and v_prior.docket=btrim(p_docket) and v_prior.destination_type=p_destination_type
      and coalesce(v_prior.van_id,v_prior.warehouse_id)=p_destination_id
    then return v_prior.quantity; end if;
    raise exception 'Receipt identifier already used';
  end if;
  select stock_unit,archived_at into v_unit,v_archived from public.products
    where id=p_product_id and company_id=v_company for update;
  if v_unit is null or v_archived is not null then raise exception 'Active product not found'; end if;
  if v_unit in ('ea','pack','container') and p_quantity<>trunc(p_quantity) then
    raise exception 'Whole item quantity required';
  end if;
  perform 1 from public.suppliers where id=p_supplier_id and company_id=v_company and active=true;
  if not found then raise exception 'Supplier not found or inactive'; end if;

  if p_destination_type='van' then
    if not exists (
      select 1 from public.user_access_capabilities cap
      where cap.user_id=v_uid and cap.company_id=v_company and cap.office_access=true
    ) and not exists (
      select 1 from public.user_authorized_vans av
      where av.user_id=v_uid and av.company_id=v_company and av.van_id=p_destination_id
    ) then raise exception 'Only authorised van receipts permitted'; end if;
    perform 1 from public.vans where id=p_destination_id and company_id=v_company for update;
    if not found then raise exception 'Invalid van'; end if;
    insert into public.stock(van_id,product_id,quantity,updated_at)
      values(p_destination_id,p_product_id,p_quantity,now())
      on conflict(van_id,product_id) do update
      set quantity=public.stock.quantity+excluded.quantity,updated_at=now();
  else
    if not exists (
      select 1 from public.user_access_capabilities cap
      where cap.user_id=v_uid and cap.company_id=v_company and cap.office_access=true
    ) then raise exception 'Warehouse receiving requires office access'; end if;
    perform 1 from public.warehouses where id=p_destination_id and company_id=v_company for update;
    if not found then raise exception 'Invalid warehouse'; end if;
    insert into public.warehouse_stock(warehouse_id,product_id,quantity,updated_at)
      values(p_destination_id,p_product_id,p_quantity,now())
      on conflict(warehouse_id,product_id) do update
      set quantity=public.warehouse_stock.quantity+excluded.quantity,updated_at=now();
  end if;

  insert into public.loose_item_receipts(
    id,company_id,product_id,supplier_id,destination_type,van_id,warehouse_id,
    quantity,docket,received_by
  ) values (
    p_receipt_id,v_company,p_product_id,p_supplier_id,p_destination_type,
    case when p_destination_type='van' then p_destination_id end,
    case when p_destination_type='warehouse' then p_destination_id end,
    p_quantity,btrim(p_docket),v_uid
  );
  return p_quantity;
end;
$$;
