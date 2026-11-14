-- A02 EMERGENCY ROLLBACK: RESTORES ORIGINAL (PERMISSIVE) SETTINGS.
-- WARNING: Restores known access-control weaknesses. Use only for a verified
-- production outage after an approved recovery decision.
-- Captured from live Supabase metadata on 14 November 2026 before A02.
-- Restore a secure alternative as soon as the regression is resolved.
begin;

drop policy if exists "vans company read" on public.vans;
drop policy if exists "stock read authorised" on public.stock;
drop policy if exists "log read authorised" on public.activity_log;

create or replace function public.my_company_id()
returns uuid language sql stable security definer
set search_path to 'public','pg_temp'
as $function$
  select company_id from profiles where id = auth.uid()
$function$;
create or replace function public.my_van_id()
returns uuid language sql stable security definer
set search_path to 'public','pg_temp'
as $function$
  select van_id from profiles where id = auth.uid()
$function$;

drop policy if exists "vans company" on public.vans;
create policy "vans company" on public.vans for all to public
  using (company_id=public.my_company_id());

drop policy if exists "stock read company" on public.stock;
create policy "stock read company" on public.stock for select to public
  using (van_id in (select v.id from public.vans v
                    where v.company_id=public.my_company_id()));
drop policy if exists "stock write own van" on public.stock;
create policy "stock write own van" on public.stock for all to public
  using (van_id=public.my_van_id());

drop policy if exists "log read company" on public.activity_log;
create policy "log read company" on public.activity_log for select to public
  using (company_id=public.my_company_id());
drop policy if exists "log insert" on public.activity_log;
create policy "log insert" on public.activity_log for insert to public
  with check (company_id=public.my_company_id());

drop policy if exists "products write manager" on public.products;
create policy "products write manager" on public.products for all to public
  using (
    company_id=public.my_company_id()
    and exists(select 1 from public.profiles p where p.id=auth.uid()
               and p.role in ('manager','admin'))
  );

-- Original direct table privileges from pre-A02 metadata:
grant all on table public.vans,public.products to anon,authenticated;
grant select,insert,delete,references,trigger,truncate
  on table public.profiles to anon,authenticated;
grant select,references,trigger,truncate
  on table public.stock,public.activity_log to anon,authenticated;
commit;
