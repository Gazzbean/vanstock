-- Coordinated with the Office Warehouse action release. No stock is altered.
-- Warehouse writes remain controlled by WAREHOUSE_WRITES_ENABLED in the app.
begin;

-- Authorisation is checked inside the database even if a user invokes an RPC
-- directly. Office access and issue/receive grants are independent settings.
create or replace function public.vanstock_warehouse_require_permission(
  p_action text,p_van_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := auth.uid();
 v_company uuid;
 v_role text;
 v_office boolean := false;
 v_permitted boolean := false;
begin
 select company_id,role into v_company,v_role from public.profiles
 where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 if p_action not in ('issue','receive','adjust','stocktake') or p_action is null then
  raise exception 'Unknown warehouse operation';
 end if;
 if v_role in ('admin','manager') then return; end if;
 if p_action in ('adjust','stocktake') then
  raise exception 'Warehouse adjustments and stocktakes require management approval';
 end if;
 select coalesce(office_access,false) into v_office from public.user_access_capabilities
 where user_id=v_actor and company_id=v_company;
 v_office:=coalesce(v_office,false);
 if not v_office and v_role <> 'technician' then
  raise exception 'Warehouse operation not authorised';
 end if;
 if p_van_id is null or not exists (
  select 1 from public.vans where id=p_van_id and company_id=v_company and active=true
 ) then raise exception 'Van not available in your company'; end if;
 -- Non-office technicians may use only vans explicitly authorised to them.
 if not v_office and not exists (
  select 1 from public.user_authorized_vans
  where user_id=v_actor and company_id=v_company and van_id=p_van_id
 ) then raise exception 'Selected van is not authorised'; end if;
 select case when p_action='issue' then coalesce(can_issue,false)
             else coalesce(can_receive,false) end into v_permitted
 from public.user_warehouse_permissions
 where user_id=v_actor and company_id=v_company;
 if not coalesce(v_permitted,false) then
  raise exception 'Warehouse % permission required',p_action;
 end if;
end;
$$;

-- A warehouse request is an approval record only; it does not change stock.
create or replace function public.create_warehouse_replenishment_request(
 p_warehouse_id uuid,p_van_id uuid,p_product_id uuid,p_quantity numeric,p_reference text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := auth.uid();
 v_company uuid;
 v_role text;
 v_office boolean := false;
 v_unit text;
 v_result uuid;
begin
 select company_id,role into v_company,v_role from public.profiles
 where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 if not (v_role in ('admin','manager') or exists (
  select 1 from public.user_warehouse_permissions
  where user_id=v_actor and company_id=v_company and can_request=true
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
 perform 1 from public.vans where id=p_van_id and company_id=v_company and active=true;
 if not found then raise exception 'Van not available in company'; end if;
 select coalesce(office_access,false) into v_office
 from public.user_access_capabilities where user_id=v_actor and company_id=v_company;
 v_office:=coalesce(v_office,false);
 if v_role not in ('admin','manager') and not v_office and not exists (
  select 1 from public.user_authorized_vans
  where user_id=v_actor and company_id=v_company and van_id=p_van_id
 ) then raise exception 'Not authorised for receiving van'; end if;
 select stock_unit into v_unit from public.products
 where id=p_product_id and company_id=v_company and archived_at is null;
 if v_unit is null then raise exception 'Active product not found'; end if;
 if v_unit in ('ea','pack','container') and p_quantity<>trunc(p_quantity) then
  raise exception 'Whole stock units required';
 end if;
 insert into public.warehouse_replenishment_requests
  (company_id,warehouse_id,van_id,product_id,quantity,reference,requested_by)
 values (v_company,p_warehouse_id,p_van_id,p_product_id,p_quantity,btrim(p_reference),v_actor)
 returning id into v_result;
 return v_result;
end;
$$;

-- The legacy movement engine's atomic stock transfer, row locking and single
-- audit event are retained. Only its authorisation branch is changed.
create or replace function public.move_warehouse_van_stock(
 p_warehouse_id uuid,p_van_id uuid,p_product_id uuid,p_quantity numeric,
 p_direction text,p_reference text default '',p_notes text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare
 v_user_id uuid := auth.uid();
 v_company_id uuid;
 v_role text;
 v_van_label text;
 v_warehouse_label text;
 v_product_label text;
 v_previous numeric(12,2);
 v_unit text;
 v_archived timestamptz;
begin
 if v_user_id is null then raise exception 'Login required'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>=1000000000 or
    p_quantity<>trunc(p_quantity,2) then raise exception 'Invalid movement quantity'; end if;
 if p_reference is null or length(btrim(p_reference))=0 or length(p_reference)>500 then
  raise exception 'A movement reference is required (up to 500 characters)';
 end if;
 if length(coalesce(p_notes,''))>2000 then raise exception 'Movement notes exceed 2000 characters'; end if;
 if p_direction not in ('warehouse-to-van','van-to-warehouse') or p_direction is null then
  raise exception 'Invalid movement direction';
 end if;
 select company_id,role into v_company_id,v_role from public.profiles
 where id=v_user_id and is_active=true;
 if v_company_id is null or v_role not in ('admin','manager','technician') then
  raise exception 'Account is not authorised';
 end if;
 -- Recheck the independent warehouse grant and authorised van in the DB.
 perform public.vanstock_warehouse_require_permission(
  case when p_direction='warehouse-to-van' then 'issue' else 'receive' end,p_van_id);
 select name,stock_unit,archived_at into v_product_label,v_unit,v_archived
 from public.products where id=p_product_id and company_id=v_company_id for update;
 if v_product_label is null then raise exception 'Product not found for company'; end if;
 if v_archived is not null then raise exception 'Archived product cannot be moved'; end if;
 select name into v_warehouse_label from public.warehouses
 where id=p_warehouse_id and company_id=v_company_id;
 if v_warehouse_label is null then raise exception 'Warehouse not found for company'; end if;
 select van_number into v_van_label from public.vans
 where id=p_van_id and company_id=v_company_id and active=true;
 if v_van_label is null then raise exception 'Van not available in company'; end if;
 if v_unit not in ('ea','kg','m','pack','container') or v_unit is null then
  raise exception 'Unsupported product stock unit';
 end if;
 if v_unit in ('ea','pack','container') and p_quantity<>trunc(p_quantity) then
  raise exception 'This product must be moved in whole units';
 end if;
 -- Fixed lock order prevents concurrent transfer races.
 perform 1 from public.warehouses where id=p_warehouse_id for update;
 perform 1 from public.vans where id=p_van_id for update;
 if p_direction='warehouse-to-van' then
  select quantity into v_previous from public.warehouse_stock
  where warehouse_id=p_warehouse_id and product_id=p_product_id for update;
  if v_previous is null or v_previous<p_quantity then
   raise exception 'Insufficient warehouse stock';
  end if;
  update public.warehouse_stock set quantity=quantity-p_quantity,updated_at=now()
  where warehouse_id=p_warehouse_id and product_id=p_product_id;
  insert into public.stock (van_id,product_id,quantity,updated_at)
  values (p_van_id,p_product_id,p_quantity,now())
  on conflict (van_id,product_id)
  do update set quantity=public.stock.quantity+excluded.quantity,updated_at=now();
 else
  select quantity into v_previous from public.stock
  where van_id=p_van_id and product_id=p_product_id for update;
  if v_previous is null or v_previous<p_quantity then
   raise exception 'Insufficient van stock';
  end if;
  update public.stock set quantity=quantity-p_quantity,updated_at=now()
  where van_id=p_van_id and product_id=p_product_id;
  insert into public.warehouse_stock (warehouse_id,product_id,quantity,updated_at)
  values (p_warehouse_id,p_product_id,p_quantity,now())
  on conflict (warehouse_id,product_id)
  do update set quantity=public.warehouse_stock.quantity+excluded.quantity,updated_at=now();
 end if;
 insert into public.activity_log
  (company_id,van_id,user_id,product_id,product_name,type,quantity,reference,notes)
 values (v_company_id,p_van_id,v_user_id,p_product_id,v_product_label,
  p_direction,p_quantity,
  v_warehouse_label||' / '||v_van_label||' / '||btrim(p_reference),
  'Warehouse/van stock movement. '||coalesce(p_notes,''));
end;
$$;

-- Keep the legacy engine private; authenticated clients use the checked RPC.
revoke all on function public.move_warehouse_van_stock(uuid,uuid,uuid,numeric,text,text,text)
 from public,anon,authenticated;
revoke all on function public.vanstock_warehouse_require_permission(text,uuid)
 from public,anon;
grant execute on function public.vanstock_warehouse_require_permission(text,uuid) to authenticated;
revoke all on function public.create_warehouse_replenishment_request(uuid,uuid,uuid,numeric,text)
 from public,anon;
grant execute on function public.create_warehouse_replenishment_request(uuid,uuid,uuid,numeric,text)
 to authenticated;
commit;
