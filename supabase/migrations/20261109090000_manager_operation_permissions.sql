-- Stage 1: administrator-configurable Manager operations. This is additive:
-- no existing stock, users, roles or request states are modified.
-- Application/backend enforcement will be deployed separately and tested before
-- any role-based bypass is removed. Back up the database before applying.
begin;

create table if not exists public.manager_operation_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  approve_requests boolean not null default false,
  issue_warehouse boolean not null default false,
  receive_returns boolean not null default false,
  adjust_stock boolean not null default false,
  maintain_catalogue boolean not null default false,
  maintain_vehicles boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create index if not exists manager_operation_permissions_company_idx
  on public.manager_operation_permissions(company_id);

create table if not exists public.manager_permission_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references public.profiles(id),
  changed_by uuid not null references public.profiles(id),
  previous_permissions jsonb,
  new_permissions jsonb not null,
  changed_at timestamptz not null default now()
);
alter table public.manager_operation_permissions enable row level security;
alter table public.manager_permission_audit enable row level security;
revoke all on public.manager_operation_permissions,public.manager_permission_audit from anon,authenticated;

-- Preserve the effective authority of any existing managers until their
-- administrator reviews it. New managers have no optional grants by default.
insert into public.manager_operation_permissions
 (user_id,company_id,approve_requests,issue_warehouse,receive_returns,
  adjust_stock,maintain_catalogue,maintain_vehicles)
select id,company_id,true,true,true,true,true,true
from public.profiles where role='manager' and is_active=true
on conflict(user_id) do nothing;

create or replace function public.set_manager_operation_permissions(
  p_user_id uuid,p_approve_requests boolean,p_issue_warehouse boolean,
  p_receive_returns boolean,p_adjust_stock boolean,
  p_maintain_catalogue boolean,p_maintain_vehicles boolean
) returns void language plpgsql security definer set search_path='' as $$
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
   or p_adjust_stock is null or p_maintain_catalogue is null or p_maintain_vehicles is null then
    raise exception 'All permissions must be specified';
  end if;
  select to_jsonb(m)-'user_id'-'company_id'-'updated_at'-'updated_by'
    into v_previous from public.manager_operation_permissions m where m.user_id=p_user_id for update;
  insert into public.manager_operation_permissions
   (user_id,company_id,approve_requests,issue_warehouse,receive_returns,
    adjust_stock,maintain_catalogue,maintain_vehicles,updated_by)
   values(p_user_id,v_company,p_approve_requests,p_issue_warehouse,p_receive_returns,
    p_adjust_stock,p_maintain_catalogue,p_maintain_vehicles,v_actor)
  on conflict(user_id) do update set
   approve_requests=excluded.approve_requests,issue_warehouse=excluded.issue_warehouse,
   receive_returns=excluded.receive_returns,adjust_stock=excluded.adjust_stock,
   maintain_catalogue=excluded.maintain_catalogue,maintain_vehicles=excluded.maintain_vehicles,
   updated_at=now(),updated_by=v_actor;
  v_new:=jsonb_build_object('approve_requests',p_approve_requests,
   'issue_warehouse',p_issue_warehouse,'receive_returns',p_receive_returns,
   'adjust_stock',p_adjust_stock,'maintain_catalogue',p_maintain_catalogue,
   'maintain_vehicles',p_maintain_vehicles);
  insert into public.manager_permission_audit
   (company_id,user_id,changed_by,previous_permissions,new_permissions)
   values(v_company,p_user_id,v_actor,v_previous,v_new);
end;
$$;
revoke all on function public.set_manager_operation_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.set_manager_operation_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

commit;
