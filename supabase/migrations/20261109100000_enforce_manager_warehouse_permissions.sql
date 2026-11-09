-- Enforce configurable Manager warehouse authority at database boundaries.
-- No existing inventory rows or request states are changed.
begin;

create or replace function public.vanstock_manager_has_permission(p_permission text)
returns boolean language plpgsql stable security definer set search_path='' as $$
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
  when 'adjust_stock' then adjust_stock
  when 'maintain_catalogue' then maintain_catalogue
  when 'maintain_vehicles' then maintain_vehicles
  else false end into v_allow
 from public.manager_operation_permissions
 where company_id=v_company and user_id=auth.uid();
 return coalesce(v_allow,false);
end;
$$;
revoke all on function public.vanstock_manager_has_permission(text) from public,anon;
grant execute on function public.vanstock_manager_has_permission(text) to authenticated;

-- This gate covers all movement wrappers, including returns and adjustments.
create or replace function public.vanstock_warehouse_require_permission(p_action text,p_van_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
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
           else 'adjust_stock' end) then return; end if;
    raise exception 'Manager permission required for warehouse %',p_action;
  end if;
  if v_role<>'technician' then raise exception 'Warehouse operation not authorised'; end if;
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
$$;

-- Manager request decisions are checked even when the existing SECURITY
-- DEFINER request RPC carries out the update. Technicians continue to use
-- the existing receiving-van authorisation in that RPC.
create or replace function public.vanstock_enforce_manager_request_transition()
returns trigger language plpgsql security definer set search_path='' as $$
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
  if not public.vanstock_manager_has_permission('receive_returns') then
   raise exception 'Manager permission required to confirm van receipt';
  end if;
 else
  raise exception 'Unrecognised warehouse request transition';
 end if;
 return new;
end;
$$;
drop trigger if exists manager_warehouse_request_transition on public.warehouse_replenishment_requests;
create trigger manager_warehouse_request_transition before update of status
on public.warehouse_replenishment_requests for each row
execute function public.vanstock_enforce_manager_request_transition();

commit;
