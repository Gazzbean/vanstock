-- A10 – Serialised physical-cylinder custody ledger.
-- This is separate from VanStock refrigerant kg/product stock accounting.
-- This migration creates EMPTY registers; it does not migrate any test
-- cylinders or change any stock, history, purchase or material balances.
begin;

create table public.cylinder_custody (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 cylinder_serial text not null check(length(btrim(cylinder_serial)) between 2 and 120),
 gas_label text not null check(length(btrim(gas_label)) between 2 and 100),
 nominal_capacity_kg numeric(10,2) check(nominal_capacity_kg>0),
 ownership text not null check(ownership in ('supplier','company','customer')),
 supplier_id uuid,
 received_on date not null,
 rent_free_until date,
 return_due_on date,
 rental_review_on date,
 rental_terms_reference text,
 cylinder_test_due_on date,
 last_leak_check_on date,
 status text not null default 'in_custody'
  check(status in ('in_custody','return_pending','returned','unaccounted')),
 location_kind text not null
  check(location_kind in ('warehouse','van','customer_site','supplier','unknown')),
 warehouse_id uuid references public.warehouses(id),
 van_id uuid references public.vans(id),
 site_reference text,
 notes text,
 audit_reference text not null check(length(btrim(audit_reference)) between 3 and 120),
 created_by uuid not null references public.profiles(id),
 updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>=1),
 constraint cylinder_supplier_same_company foreign key(supplier_id,company_id)
   references public.suppliers(id,company_id),
 constraint supplier_owned_cylinder_has_supplier
   check(ownership<>'supplier' or supplier_id is not null),
 constraint cylinder_dates_valid check(
    (rent_free_until is null or rent_free_until>=received_on)
    and (return_due_on is null or return_due_on>=received_on)
    and (rental_review_on is null or rental_review_on>=received_on)
 ),
 constraint cylinder_hire_dates_have_terms check(
    (rent_free_until is null and return_due_on is null and rental_review_on is null)
    or (supplier_id is not null and length(btrim(coalesce(rental_terms_reference,'')))>=3)
 ),
 constraint cylinder_location_valid check(
  (location_kind='warehouse' and warehouse_id is not null and van_id is null and site_reference is null)
  or (location_kind='van' and van_id is not null and warehouse_id is null and site_reference is null)
  or (location_kind='customer_site' and warehouse_id is null and van_id is null
     and length(btrim(coalesce(site_reference,''))) between 3 and 250)
  or (location_kind in ('supplier','unknown') and warehouse_id is null and van_id is null and site_reference is null)
 ),
 constraint cylinder_status_location_valid check(
  (status in ('in_custody','return_pending') and location_kind in ('warehouse','van','customer_site','unknown'))
  or (status='returned' and location_kind='supplier' and supplier_id is not null)
  or (status='unaccounted' and location_kind='unknown')
 )
);
create unique index cylinder_custody_unique_serial on public.cylinder_custody
 (company_id,lower(btrim(cylinder_serial)));
create index cylinder_custody_company_status on public.cylinder_custody
 (company_id,status,return_due_on);
create index cylinder_custody_supplier on public.cylinder_custody
 (company_id,supplier_id,status);

-- Immutable event trail: status, physical custody, and hire-date corrections
-- are versioned; the register is NOT a refrigerant-gas consumption ledger.
create table public.cylinder_custody_events (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 cylinder_id uuid not null references public.cylinder_custody(id),
 event_kind text not null check(event_kind in ('registered','updated')),
 audit_reference text not null,
 actor_id uuid not null references public.profiles(id),
 before_state jsonb,
 after_state jsonb not null,
 occurred_at timestamptz not null default now()
);
create index cylinder_custody_events_company_date on public.cylinder_custody_events
 (company_id,occurred_at desc,id);
create index cylinder_custody_events_cylinder on public.cylinder_custody_events
 (cylinder_id,occurred_at desc);

create function public.cylinder_custody_version_guard()
returns trigger language plpgsql set search_path='' as $a10$
begin
 if tg_op='DELETE' then raise exception 'Cylinder custody cannot be deleted; record a custody status instead'; end if;
 if new.company_id is distinct from old.company_id
    or new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
   raise exception 'Cylinder ownership identity and creation audit cannot be rewritten';
 end if;
 new.version := old.version+1;
 new.updated_at := now();
 return new;
end;$a10$;
create trigger cylinder_custody_before_update before update or delete on public.cylinder_custody
 for each row execute function public.cylinder_custody_version_guard();

create function public.cylinder_custody_audit()
returns trigger language plpgsql set search_path='' as $a10$
begin
 insert into public.cylinder_custody_events
  (company_id,cylinder_id,event_kind,audit_reference,actor_id,before_state,after_state)
 values(new.company_id,new.id,
  case when tg_op='INSERT' then 'registered' else 'updated' end,
  new.audit_reference,new.updated_by,
  case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return null;
end;$a10$;
create trigger cylinder_custody_after_write after insert or update on public.cylinder_custody
 for each row execute function public.cylinder_custody_audit();

create function public.cylinder_custody_no_event_rewrite()
returns trigger language plpgsql set search_path='' as $a10$
begin raise exception 'Cylinder audit events are immutable'; end;$a10$;
create trigger cylinder_custody_no_event_change before update or delete on public.cylinder_custody_events
 for each row execute function public.cylinder_custody_no_event_rewrite();

alter table public.cylinder_custody enable row level security;
alter table public.cylinder_custody_events enable row level security;
revoke all on table public.cylinder_custody,public.cylinder_custody_events from public,anon,authenticated;
grant select,insert,update,delete on table public.cylinder_custody to service_role;
grant select,insert on table public.cylinder_custody_events to service_role;
revoke all on function public.cylinder_custody_version_guard(),
 public.cylinder_custody_audit(),public.cylinder_custody_no_event_rewrite() from public,anon,authenticated;
commit;
