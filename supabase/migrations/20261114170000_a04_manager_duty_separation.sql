-- A04: split Manager warehouse authorities; no inventory or request status changes.
-- Existing Manager grants retained; new van-receipt and stocktake grants fail closed.
-- Explicit Admin action is required to grant either new authority.
begin;
alter table public.manager_operation_permissions
 add column confirm_van_receipt boolean not null default false,
 add column stocktake_warehouse boolean not null default false;

CREATE OR REPLACE FUNCTION public.vanstock_manager_has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_role text; v_allow boolean;
begin
 select company_id,role into v_company,v_role from public.profiles
 where id=auth.uid() and is_active=true;
 if v_company is null then return false; end if;
 if v_role='admin' then return true; end if;
 if v_role<>'manager' then return false; end if;
 select case p_permission
  when 'approve_requests' then approve_requests
  when 'issue_warehouse' then issue_warehouse
  when 'receive_returns' then receive_returns
  when 'confirm_van_receipt' then confirm_van_receipt
  when 'stocktake_warehouse' then stocktake_warehouse
  when 'adjust_stock' then adjust_stock
  when 'maintain_catalogue' then maintain_catalogue
  when 'maintain_vehicles' then maintain_vehicles
  else false end into v_allow
 from public.manager_operation_permissions
 where company_id=v_company and user_id=auth.uid();
 return coalesce(v_allow,false);
end;
$function$;
CREATE OR REPLACE FUNCTION public.vanstock_warehouse_require_permission(p_action text, p_van_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid(); v_company uuid; v_role text;
  v_default_van uuid; v_permitted boolean;
begin
  select company_id,role,van_id into v_company,v_role,v_default_van
  from public.profiles where id=v_user and is_active=true;
  if v_company is null then raise exception 'Active login required'; end if;
  if p_action is null or p_action not in ('issue','receive','adjust','stocktake') then
    raise exception 'Unknown warehouse operation';
  end if;
  if v_role='admin' then return; end if;
  if v_role='manager' then
    if public.vanstock_manager_has_permission(
      case when p_action='issue' then 'issue_warehouse'
           when p_action='receive' then 'receive_returns'
           when p_action='stocktake' then 'stocktake_warehouse'
           else 'adjust_stock' end) then return; end if;
    raise exception 'Manager permission required for warehouse %',p_action;
  end if;
  if v_role<>'technician' then raise exception 'Warehouse operation not authorised'; end if;
  if not exists(select 1 from public.user_access_capabilities
    where user_id=v_user and company_id=v_company and technician_access=true) then
    raise exception 'Technician access required for warehouse movements'; end if;
  if p_action in ('adjust','stocktake') then
    raise exception 'Warehouse adjustments and stocktakes require management approval';
  end if;
  if p_van_id is null or v_default_van is distinct from p_van_id then
    raise exception 'Warehouse movement restricted to assigned default van';
  end if;
  select case when p_action='issue' then coalesce(can_issue,false)
              else coalesce(can_receive,false) end into v_permitted
  from public.user_warehouse_permissions where user_id=v_user and company_id=v_company;
  if not coalesce(v_permitted,false) then
    raise exception 'Warehouse % permission required',p_action;
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.vanstock_enforce_manager_request_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; v_company uuid;
begin
 if new.status is not distinct from old.status then return new; end if;
 select role,company_id into v_role,v_company from public.profiles
 where id=auth.uid() and is_active=true;
 if v_role is distinct from 'manager' then return new; end if;
 if v_company is distinct from old.company_id then
  raise exception 'Request belongs to another company';
 end if;
 if old.status='pending' and new.status in ('approved','rejected') then
  if not public.vanstock_manager_has_permission('approve_requests') then
   raise exception 'Manager permission required to review warehouse requests';
  end if;
 elsif old.status='approved' and new.status='issued' then
  if not public.vanstock_manager_has_permission('issue_warehouse') then
   raise exception 'Manager permission required to issue warehouse stock';
  end if;
 elsif old.status='issued' and new.status='fulfilled' then
  if not public.vanstock_manager_has_permission('confirm_van_receipt') then
   raise exception 'Manager permission required to confirm van receipt';
  end if;
 else
  raise exception 'Unrecognised warehouse request transition';
 end if;
 return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.vanstock_warehouse_adjust(p_warehouse_id uuid, p_product_id uuid, p_operation text, p_quantity numeric, p_reference text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_reference text;
begin
 if p_operation is null or p_operation not in ('add','remove','set') then
  raise exception 'Invalid warehouse stock adjustment operation'; end if;
 perform public.vanstock_warehouse_require_permission(case when p_operation='set' then 'stocktake' else 'adjust' end);
 if length(btrim(coalesce(p_reference,'')))=0 then
  raise exception 'Adjustment reason is required';
 end if;
 v_reference:=public.vanstock_next_stock_reference(
  case when p_operation='set' then 'STK' else 'ADJ' end)
  ||' — '||btrim(p_reference);
 return public.adjust_warehouse_stock(p_warehouse_id,p_product_id,p_operation,p_quantity,v_reference);
end;
$function$;
CREATE OR REPLACE FUNCTION public.confirm_warehouse_replenishment_receipt(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid := auth.uid();
 v_company uuid;
 v_role text;
 v_req public.warehouse_replenishment_requests%rowtype;
 v_product_name text;
 v_stock_unit text;
 v_warehouse_name text;
 v_van_name text;
 v_available numeric;
 v_committed numeric;
begin
 select company_id,role into v_company,v_role from public.profiles
 where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 select * into v_req from public.warehouse_replenishment_requests
 where id=p_request_id and company_id=v_company for update;
 if not found then raise exception 'Request not found'; end if;
 if v_req.status <> 'issued' then raise exception 'Warehouse has not issued this request, or receipt is already recorded'; end if;
 if v_role='manager' and not public.vanstock_manager_has_permission('confirm_van_receipt') then
  raise exception 'Manager permission required to confirm van receipt'; end if;
 if v_role not in ('admin','manager') and (
    v_role<>'technician'
    or not exists(select 1 from public.user_access_capabilities c
      where c.user_id=v_actor and c.company_id=v_company and c.technician_access=true)
    or not exists (
      select 1 from public.profiles where id=v_actor and van_id=v_req.van_id
      union all
      select 1 from public.user_authorized_vans where user_id=v_actor and van_id=v_req.van_id
    )
 ) then raise exception 'You are not authorised to receive stock into this van'; end if;
 -- Use the same lock order as the movement engine. The receiver is authorised
 -- to accept into this van but does not require warehouse-issue permission.
 select name,stock_unit into v_product_name,v_stock_unit from public.products
 where id=v_req.product_id and company_id=v_company and archived_at is null for update;
 if v_product_name is null then raise exception 'Product is unavailable'; end if;
 select name into v_warehouse_name from public.warehouses
 where id=v_req.warehouse_id and company_id=v_company for update;
 if v_warehouse_name is null then raise exception 'Warehouse is unavailable'; end if;
 select van_number into v_van_name from public.vans
 where id=v_req.van_id and company_id=v_company and active=true for update;
 if v_van_name is null then raise exception 'Receiving van is inactive'; end if;
 if v_stock_unit in ('ea','pack','container') and v_req.quantity<>trunc(v_req.quantity) then
  raise exception 'Whole stock units required'; end if;
 select quantity,committed_quantity into v_available,v_committed from public.warehouse_stock
 where warehouse_id=v_req.warehouse_id and product_id=v_req.product_id for update;
 if v_available is null or v_available<v_req.quantity
    or v_committed is null or v_committed<v_req.quantity then
  raise exception 'Issued stock commitment is missing or warehouse quantity is insufficient; contact warehouse'; end if;
 -- Inventory, audit and receipt status are one transaction.
 update public.warehouse_stock
 set quantity=quantity-v_req.quantity,
     committed_quantity=committed_quantity-v_req.quantity,
     updated_at=now()
 where warehouse_id=v_req.warehouse_id and product_id=v_req.product_id;
 insert into public.stock(van_id,product_id,quantity,updated_at)
 values(v_req.van_id,v_req.product_id,v_req.quantity,now())
 on conflict(van_id,product_id)
 do update set quantity=public.stock.quantity+excluded.quantity,updated_at=now();
 insert into public.activity_log
  (company_id,van_id,user_id,product_id,product_name,type,quantity,reference,notes)
 values(v_company,v_req.van_id,v_actor,v_req.product_id,v_product_name,
  'warehouse-to-van',v_req.quantity,
  v_warehouse_name||' / '||v_van_name||' / Request '||v_req.id::text||' / '||v_req.reference,
  'Warehouse issue accepted by receiving technician');
 update public.warehouse_replenishment_requests
 set status='fulfilled',received_by=v_actor,received_at=now(),
     fulfilled_by=v_actor,fulfilled_at=now()
 where id=p_request_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.report_warehouse_receipt_discrepancy(p_request_id uuid, p_observed_quantity numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_company uuid;v_role text;v_req public.warehouse_replenishment_requests%rowtype;
begin
 select company_id,role into v_company,v_role from public.profiles where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 select * into v_req from public.warehouse_replenishment_requests where id=p_request_id and company_id=v_company for update;
 if not found or v_req.status<>'issued' then raise exception 'Only issued requests can be reported'; end if;
 if v_role<>'admin' and not (
  (v_role='manager' and public.vanstock_manager_has_permission('confirm_van_receipt')) or
  (v_role='technician'
    and exists(select 1 from public.user_access_capabilities c
      where c.user_id=v_actor and c.company_id=v_company and c.technician_access=true)
    and (
      exists(select 1 from public.profiles where id=v_actor and van_id=v_req.van_id)
      or exists(select 1 from public.user_authorized_vans where user_id=v_actor and van_id=v_req.van_id)
    )
  )
 ) then raise exception 'Not authorised for the receiving van'; end if;
 if p_observed_quantity is null or p_observed_quantity<0 or p_observed_quantity>v_req.quantity then
  raise exception 'Reported quantity must be between zero and the issued quantity';
 end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Explain the discrepancy'; end if;
 insert into public.warehouse_receipt_discrepancies
 (company_id,request_id,observed_quantity,reason,reported_by)
 values(v_company,p_request_id,p_observed_quantity,btrim(p_reason),v_actor);
 insert into public.warehouse_notifications(company_id,user_id,request_id,event_type)
 select v_company,p.id,p_request_id,'discrepancy' from public.profiles p
 where p.company_id=v_company and p.is_active=true and p.id is distinct from v_actor
 and (p.role='admin' or (p.role='manager' and exists(
  select 1 from public.manager_operation_permissions m
  where m.user_id=p.id and m.company_id=v_company and m.issue_warehouse=true)))
 on conflict do nothing;
end;
$function$;

-- New signature avoids hidden implicit rights from the six-grant legacy RPC.
CREATE OR REPLACE FUNCTION public.set_manager_operation_permissions(p_user_id uuid, p_approve_requests boolean, p_issue_warehouse boolean, p_receive_returns boolean, p_adjust_stock boolean, p_maintain_catalogue boolean, p_maintain_vehicles boolean, p_confirm_van_receipt boolean, p_stocktake_warehouse boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_company uuid;
  v_target_company uuid;
  v_target_role text;
  v_previous jsonb;
  v_new jsonb;
begin
  select company_id into v_company from public.profiles
   where id=v_actor and role='admin' and is_active=true;
  if v_company is null then raise exception 'Administrator permission required'; end if;
  select company_id,role into v_target_company,v_target_role from public.profiles
   where id=p_user_id and is_active=true;
  if v_target_company is distinct from v_company or v_target_role is distinct from 'manager' then
    raise exception 'Select an active Manager belonging to your company';
  end if;
  if p_approve_requests is null or p_issue_warehouse is null or p_receive_returns is null
   or p_adjust_stock is null or p_maintain_catalogue is null or p_maintain_vehicles is null
   or p_confirm_van_receipt is null or p_stocktake_warehouse is null then
    raise exception 'All permissions must be specified';
  end if;
  select to_jsonb(m)-'user_id'-'company_id'-'updated_at'-'updated_by'
    into v_previous from public.manager_operation_permissions m where m.user_id=p_user_id for update;
  insert into public.manager_operation_permissions
   (user_id,company_id,approve_requests,issue_warehouse,receive_returns,
    adjust_stock,maintain_catalogue,maintain_vehicles,confirm_van_receipt,stocktake_warehouse,updated_by)
   values(p_user_id,v_company,p_approve_requests,p_issue_warehouse,p_receive_returns,
    p_adjust_stock,p_maintain_catalogue,p_maintain_vehicles,p_confirm_van_receipt,p_stocktake_warehouse,v_actor)
  on conflict(user_id) do update set
   approve_requests=excluded.approve_requests,issue_warehouse=excluded.issue_warehouse,
   receive_returns=excluded.receive_returns,adjust_stock=excluded.adjust_stock,
   maintain_catalogue=excluded.maintain_catalogue,maintain_vehicles=excluded.maintain_vehicles,
   confirm_van_receipt=excluded.confirm_van_receipt,stocktake_warehouse=excluded.stocktake_warehouse,
   updated_at=now(),updated_by=v_actor;
  v_new:=jsonb_build_object('approve_requests',p_approve_requests,
   'issue_warehouse',p_issue_warehouse,'receive_returns',p_receive_returns,
   'adjust_stock',p_adjust_stock,'maintain_catalogue',p_maintain_catalogue,
   'maintain_vehicles',p_maintain_vehicles,'confirm_van_receipt',p_confirm_van_receipt,
   'stocktake_warehouse',p_stocktake_warehouse);
  insert into public.manager_permission_audit
   (company_id,user_id,changed_by,previous_permissions,new_permissions)
   values(v_company,p_user_id,v_actor,v_previous,v_new);
end;
$function$;
revoke all on function public.set_manager_operation_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.set_manager_operation_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
-- No frontend or RPC caller should retain the previous six-permission setter.
drop function public.set_manager_operation_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean);
commit;
