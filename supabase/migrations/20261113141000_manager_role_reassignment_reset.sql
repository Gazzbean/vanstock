-- Reset discretionary Manager grants on each base-role transition involving Manager.
-- This prevents stale privileges reappearing when a former Manager is reappointed.
begin;
create or replace function public.configure_user_base_role(
 p_user_id uuid,p_is_active boolean,p_role text
) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_company uuid;v_old_role text;v_old_active boolean;
begin
 select company_id into v_company from public.profiles where id=v_actor and role='admin' and is_active=true;
 if v_company is null then raise exception 'Active administrator required';end if;
 if p_user_id is null or p_is_active is null or p_role is null or p_role not in ('technician','manager','admin')
 then raise exception 'Invalid user role settings';end if;
 select role,is_active into v_old_role,v_old_active from public.profiles
 where id=p_user_id and company_id=v_company for update;
 if not found then raise exception 'Staff account not found in your company';end if;
 if p_user_id=v_actor and (not p_is_active or p_role<>'admin') then
  raise exception 'Cannot disable or demote your own administrator account';end if;
 if v_old_role='admin' and v_old_active and (p_role<>'admin' or not p_is_active)
  and not exists(select 1 from public.profiles where company_id=v_company and id<>p_user_id and role='admin' and is_active=true)
 then raise exception 'At least one active administrator must remain';end if;
 if v_old_role is not distinct from p_role and v_old_active is not distinct from p_is_active then return;end if;
 update public.profiles set role=p_role,is_active=p_is_active where id=p_user_id and company_id=v_company;
 update public.user_access_capabilities set manage_users=(p_role='admin'),updated_at=now(),updated_by=v_actor
 where user_id=p_user_id and company_id=v_company;
 if v_old_role='manager' or p_role='manager' then
  insert into public.manager_operation_permissions
   (user_id,company_id,approve_requests,issue_warehouse,receive_returns,adjust_stock,maintain_catalogue,maintain_vehicles,updated_by)
  values(p_user_id,v_company,false,false,false,false,false,false,v_actor)
  on conflict(user_id) do update set approve_requests=false,issue_warehouse=false,receive_returns=false,
   adjust_stock=false,maintain_catalogue=false,maintain_vehicles=false,updated_at=now(),updated_by=v_actor;
 end if;
 insert into public.user_role_change_audit(company_id,user_id,changed_by,old_role,new_role,old_active,new_active)
 values(v_company,p_user_id,v_actor,v_old_role,p_role,v_old_active,p_is_active);
end;
$$;
commit;
