-- Phase 2A: Assign a catalogue product to one consumables group.
-- This migration creates configuration only; no historical or physical stock is changed.
create table public.product_consumables_groups (
 product_id uuid primary key,
 company_id uuid not null,
 group_id uuid not null,
 updated_at timestamptz not null default now(),
 foreign key(product_id,company_id) references public.products(id,company_id) on delete restrict,
 foreign key(group_id) references public.consumables_groups(id) on delete restrict
);
create unique index product_consumables_groups_company_product_idx on public.product_consumables_groups(company_id,product_id);
alter table public.product_consumables_groups enable row level security;
revoke all on public.product_consumables_groups from anon;
grant select,insert,update on public.product_consumables_groups to authenticated;
create policy "consumables assignment read" on public.product_consumables_groups for select to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=product_consumables_groups.company_id));
create policy "consumables assignment insert" on public.product_consumables_groups for insert to authenticated
 with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=product_consumables_groups.company_id and p.role in ('admin','manager')));
create policy "consumables assignment update" on public.product_consumables_groups for update to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=product_consumables_groups.company_id and p.role in ('admin','manager')))
 with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=product_consumables_groups.company_id and p.role in ('admin','manager')));
