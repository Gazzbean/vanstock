-- A05 – align technician Van→Warehouse returns with the currently selected
-- authorised Working Van while preserving database-level van membership checks.
-- No stock quantities, requests or user grants are modified.
begin;
CREATE OR REPLACE FUNCTION public.vanstock_warehouse_require_permission(p_action text, p_van_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid(); v_company uuid; v_role text;
  v_permitted boolean;
begin
  select company_id,role into v_company,v_role
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
  if p_van_id is null or not exists (
    select 1 from public.user_authorized_vans a
    join public.vans v on v.id=a.van_id and v.company_id=a.company_id
    where a.user_id=v_user and a.company_id=v_company
      and a.van_id=p_van_id and v.active=true
  ) then
    raise exception 'Warehouse movement restricted to an authorised active van';
  end if;
  select case when p_action='issue' then coalesce(can_issue,false)
              else coalesce(can_receive,false) end into v_permitted
  from public.user_warehouse_permissions where user_id=v_user and company_id=v_company;
  if not coalesce(v_permitted,false) then
    raise exception 'Warehouse % permission required',p_action;
  end if;
end;
$function$;
commit;
