-- A05 rollback: restore pre-A05 default-van-only gate.
-- Emergency only: this removes alternate authorised Working Van support.
-- Restore matching application code if rollback is executed.
-- Captured from live production function before A05 migration.
begin;
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
commit;
