-- Phase 1C – additive van-level standards; existing stock untouched.
create table public.van_stock_standards (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 van_id uuid not null,
 product_id uuid not null,
 classification text not null check(classification in ('mandatory','preferred','optional','not_assigned')),
 min_quantity numeric(14,2) not null default 0 check(min_quantity>=0),
 target_quantity numeric(14,2) not null default 0 check(target_quantity>=min_quantity),
 updated_at timestamptz not null default now(),
 foreign key(van_id,company_id) references public.vans(id,company_id) on delete restrict,
 foreign key(product_id,company_id) references public.products(id,company_id) on delete restrict,
 unique(van_id,product_id),
 check(classification not in ('optional','not_assigned') or (min_quantity=0 and target_quantity=0))
);
create index van_stock_standards_company_van on public.van_stock_standards(company_id,van_id);
alter table public.van_stock_standards enable row level security;
revoke all on public.van_stock_standards from anon;
grant select,insert,update on public.van_stock_standards to authenticated;
create policy "van standards company read" on public.van_stock_standards for select to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=van_stock_standards.company_id));
create policy "van standards manager insert" on public.van_stock_standards for insert to authenticated
 with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=van_stock_standards.company_id and p.role in ('admin','manager')));
create policy "van standards manager update" on public.van_stock_standards for update to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=van_stock_standards.company_id and p.role in ('admin','manager')))
 with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=van_stock_standards.company_id and p.role in ('admin','manager')));
