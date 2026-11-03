-- STAGED ONLY. Apply together with the matching application release, after backup.
-- Requests and approvals never alter stock. Fulfilment uses the existing atomic movement RPC.
begin;

create table if not exists public.warehouse_replenishment_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  warehouse_id uuid not null references public.warehouses(id),
  van_id uuid not null references public.vans(id),
  product_id uuid not null references public.products(id),
  quantity numeric(12,2) not null check (quantity > 0),
  reference text not null check (length(btrim(reference)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','fulfilled')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  fulfilled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  fulfilled_at timestamptz
);
create index if not exists warehouse_requests_company_status_created
  on public.warehouse_replenishment_requests(company_id, status, created_at desc);
create index if not exists warehouse_requests_van_created
  on public.warehouse_replenishment_requests(van_id, created_at desc);
alter table public.warehouse_replenishment_requests enable row level security;
revoke all on public.warehouse_replenishment_requests from public, anon, authenticated;

create or replace function public.create_warehouse_replenishment_request(
  p_warehouse_id uuid, p_van_id uuid, p_product_id uuid,
  p_quantity numeric, p_reference text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_unit text;
  v_result uuid;
begin
  select company_id, role into v_company, v_role from public.profiles
  where id = v_actor and is_active = true;
  if v_company is null then raise exception 'Active login required'; end if;
  if not (v_role in ('admin','manager') or exists (
    select 1 from public.user_warehouse_permissions
    where user_id = v_actor and company_id = v_company and can_request = true
  )) then raise exception 'Warehouse request permission required'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity >= 1000000000
     or p_quantity <> trunc(p_quantity,2) then
    raise exception 'Quantity must be positive with at most two decimals';
  end if;
  if p_reference is null or length(btrim(p_reference)) not between 1 and 500 then
    raise exception 'A reference of 1 to 500 characters is required';
  end if;
  perform 1 from public.warehouses where id=p_warehouse_id and company_id=v_company;
  if not found then raise exception 'Warehouse not found for company'; end if;
  perform 1 from public.vans where id=p_van_id and company_id=v_company;
  if not found then raise exception 'Van not found for company'; end if;
  -- Non-managers must have explicit working-van authorisation (not a client-supplied van).
  if v_role not in ('admin','manager') and not exists (
    select 1 from public.profiles where id=v_actor and van_id=p_van_id
    union all
    select 1 from public.user_authorized_vans where user_id=v_actor and van_id=p_van_id
  ) then raise exception 'Not authorised for receiving van'; end if;
  select stock_unit into v_unit from public.products
  where id=p_product_id and company_id=v_company and archived_at is null;
  if v_unit is null then raise exception 'Active product not found'; end if;
  if v_unit in ('ea','pack','container') and p_quantity <> trunc(p_quantity) then
    raise exception 'Whole stock units required';
  end if;
  insert into public.warehouse_replenishment_requests
    (company_id,warehouse_id,van_id,product_id,quantity,reference,requested_by)
  values (v_company,p_warehouse_id,p_van_id,p_product_id,p_quantity,btrim(p_reference),v_actor)
  returning id into v_result;
  return v_result;
end;
$$;

create or replace function public.process_warehouse_replenishment_request(
  p_request_id uuid, p_action text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_req public.warehouse_replenishment_requests%rowtype;
begin
  select company_id, role into v_company, v_role from public.profiles
  where id=v_actor and is_active=true;
  if v_company is null or v_role not in ('admin','manager') then
    raise exception 'Manager or administrator authorisation required';
  end if;
  if p_action not in ('approve','reject','fulfil') or p_action is null then
    raise exception 'Unknown request action';
  end if;
  select * into v_req from public.warehouse_replenishment_requests
  where id=p_request_id and company_id=v_company for update;
  if not found then raise exception 'Request not found'; end if;
  if p_action in ('approve','reject') then
    if v_req.status <> 'pending' then raise exception 'Request already reviewed'; end if;
    update public.warehouse_replenishment_requests set
      status=case when p_action='approve' then 'approved' else 'rejected' end,
      reviewed_by=v_actor, reviewed_at=now() where id=p_request_id;
  else
    if v_req.status <> 'approved' then raise exception 'Only approved requests may be fulfilled'; end if;
    -- Both stock movement and request status change commit or roll back together.
    perform public.move_warehouse_van_stock(
      v_req.warehouse_id,v_req.van_id,v_req.product_id,v_req.quantity,
      'warehouse-to-van', 'Request '||v_req.id::text||' / '||v_req.reference,
      'Approved warehouse replenishment');
    update public.warehouse_replenishment_requests
    set status='fulfilled',fulfilled_by=v_actor,fulfilled_at=now()
    where id=p_request_id;
  end if;
end;
$$;
revoke all on function public.create_warehouse_replenishment_request(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.create_warehouse_replenishment_request(uuid,uuid,uuid,numeric,text) to authenticated;
revoke all on function public.process_warehouse_replenishment_request(uuid,text) from public, anon;
grant execute on function public.process_warehouse_replenishment_request(uuid,text) to authenticated;
commit;
