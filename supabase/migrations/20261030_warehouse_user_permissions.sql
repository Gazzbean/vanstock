-- VanStock: administrator-configurable warehouse permissions (PREPARATION ONLY).
-- Do NOT apply until the database and app change have been tested together.
-- Existing vans, products, stock balances and users are not modified.
create table if not exists public.user_warehouse_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  can_view boolean not null default false,
  can_request boolean not null default true,
  can_issue boolean not null default false,
  can_receive boolean not null default false,
  can_adjust boolean not null default false,
  can_stocktake boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.warehouse_permission_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references public.profiles(id),
  changed_by uuid references public.profiles(id) on delete set null,
  previous_permissions jsonb,
  new_permissions jsonb not null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_warehouse_permission_audit_company
  on public.warehouse_permission_audit (company_id, changed_at desc);

alter table public.user_warehouse_permissions enable row level security;
alter table public.warehouse_permission_audit enable row level security;
revoke all on table public.user_warehouse_permissions, public.warehouse_permission_audit from anon, authenticated;
-- Intentionally no client-side RLS policies: only role-checked server reads,
-- and the authenticated RPC below for changes. Service-role bypasses RLS.

create or replace function public.set_warehouse_user_permissions(
  p_user_id uuid,
  p_can_view boolean,
  p_can_request boolean,
  p_can_issue boolean,
  p_can_receive boolean,
  p_can_adjust boolean,
  p_can_stocktake boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid;
  v_target_company uuid;
  v_target_role text;
  v_previous jsonb;
  v_new jsonb;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;

  select company_id into v_company from public.profiles
  where id = v_actor and role = 'admin';
  if v_company is null then raise exception 'Administrator permission required'; end if;

  select company_id, role into v_target_company, v_target_role
  from public.profiles where id = p_user_id;
  if v_target_company is distinct from v_company then
    raise exception 'User does not belong to your company';
  end if;
  if v_target_role <> 'technician' then
    raise exception 'Individual warehouse permissions are only configurable for technicians';
  end if;

  if p_can_view is null or p_can_request is null or p_can_issue is null or
     p_can_receive is null or p_can_adjust is null or p_can_stocktake is null then
    raise exception 'All permissions must be specified';
  end if;

  select to_jsonb(p) - 'updated_at' - 'updated_by' - 'user_id' - 'company_id'
  into v_previous from public.user_warehouse_permissions p
  where p.user_id = p_user_id for update;

  insert into public.user_warehouse_permissions
    (user_id, company_id, can_view, can_request, can_issue, can_receive, can_adjust, can_stocktake, updated_by)
  values
    (p_user_id, v_company, p_can_view, p_can_request, p_can_issue, p_can_receive, p_can_adjust, p_can_stocktake, v_actor)
  on conflict (user_id) do update set
    can_view = excluded.can_view,
    can_request = excluded.can_request,
    can_issue = excluded.can_issue,
    can_receive = excluded.can_receive,
    can_adjust = excluded.can_adjust,
    can_stocktake = excluded.can_stocktake,
    updated_by = v_actor,
    updated_at = now();

  v_new := jsonb_build_object('can_view', p_can_view, 'can_request', p_can_request,
    'can_issue', p_can_issue, 'can_receive', p_can_receive,
    'can_adjust', p_can_adjust, 'can_stocktake', p_can_stocktake);

  insert into public.warehouse_permission_audit
    (company_id, user_id, changed_by, previous_permissions, new_permissions)
  values (v_company, p_user_id, v_actor, v_previous, v_new);
end;
$$;

revoke all on function public.set_warehouse_user_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean)
  from public, anon;
grant execute on function public.set_warehouse_user_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean)
  to authenticated;

-- Note: a separate warehouse-location/stock-ledger migration is still required.
-- These permissions do NOT yet grant operational warehouse stock access.
