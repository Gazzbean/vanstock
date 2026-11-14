-- A02: Security boundary hardening (draft, NOT applied to production).
-- Changes require isolated-role regression acceptance prior to migration.
-- Server-side administrative actions use service_role, whose grants are unchanged.
begin;

-- Inactive sessions must not retain company-scoped API access.
create or replace function public.my_company_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select p.company_id from public.profiles p
  where p.id=(select auth.uid()) and p.is_active is true;
$$;
create or replace function public.my_van_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select p.van_id from public.profiles p
  where p.id=(select auth.uid()) and p.is_active is true;
$$;

-- Existing company-level "FOR ALL" policies are unsafe if client DML grants
-- are accidentally restored. Replace them with explicit SELECT-only policies.
drop policy if exists "vans company" on public.vans;
drop policy if exists "vans company read" on public.vans;
create policy "vans company read" on public.vans
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      left join public.user_access_capabilities c on c.user_id=p.id and c.company_id=p.company_id
      where p.id=(select auth.uid()) and p.company_id=vans.company_id and p.is_active is true
        and (
          p.role='admin' or coalesce(c.office_access,false)
          or (coalesce(c.technician_access,false) and exists (
            select 1 from public.user_authorized_vans av
            where av.user_id=p.id and av.company_id=p.company_id and av.van_id=vans.id
          ))
        )
    )
  );

drop policy if exists "products write manager" on public.products;
-- Product changes go through permission-checked server actions.
drop policy if exists "stock read company" on public.stock;
drop policy if exists "stock write own van" on public.stock;
drop policy if exists "stock read authorised" on public.stock;
create policy "stock read authorised" on public.stock
  for select to authenticated
  using (
    exists (
      select 1
      from public.vans v
      join public.profiles p on p.company_id=v.company_id
      left join public.user_access_capabilities c
        on c.user_id=p.id and c.company_id=p.company_id
      where v.id=stock.van_id
        and p.id=(select auth.uid())
        and p.is_active is true
        and (
          p.role='admin'
          or coalesce(c.office_access,false)
          or (
            coalesce(c.technician_access,false)
            and exists (
              select 1 from public.user_authorized_vans av
              where av.user_id=p.id and av.company_id=p.company_id
                and av.van_id=stock.van_id
            )
          )
        )
    )
  );

drop policy if exists "log read company" on public.activity_log;
drop policy if exists "log insert" on public.activity_log;
drop policy if exists "log read authorised" on public.activity_log;
create policy "log read authorised" on public.activity_log
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      left join public.user_access_capabilities c
        on c.user_id=p.id and c.company_id=p.company_id
      where p.id=(select auth.uid())
        and p.company_id=activity_log.company_id
        and p.is_active is true
        and (
          p.role='admin'
          or coalesce(c.office_access,false)
          or (
            coalesce(c.technician_access,false)
            and activity_log.van_id is not null
            and exists (
              select 1 from public.user_authorized_vans av
              where av.user_id=p.id and av.company_id=p.company_id
                and av.van_id=activity_log.van_id
            )
          )
        )
    )
  );

-- RLS is NOT a substitute for revoking unwanted API privileges:
-- TRUNCATE, for example, is not filtered by row policies.
revoke all on table
  public.vans,public.stock,public.activity_log,public.products,public.profiles
  from anon,authenticated;
grant select on table
  public.vans,public.stock,public.activity_log,public.products,public.profiles
  to authenticated;

-- Server actions and controlled RPCs continue using their original privileges.
-- Do not alter service_role, user management RPC grants, or stock movement RPCs.
commit;
