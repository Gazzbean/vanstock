-- ============================================================
-- VanStock — Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- COMPANIES
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- VANS
create table if not exists vans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  van_number text not null,
  created_at timestamptz default now()
);

-- PROFILES (one per Supabase auth user)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  full_name text not null,
  role text not null default 'technician', -- 'technician' | 'manager' | 'admin'
  created_at timestamptz default now()
);

-- PRODUCTS  (the catalogue of items that can be on a van)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  category text not null default 'Other',
  min_stock int not null default 2,
  created_at timestamptz default now()
);

-- STOCK  (current quantity of a product on a specific van)
create table if not exists stock (
  id uuid primary key default gen_random_uuid(),
  van_id uuid references vans(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  quantity int not null default 0,
  updated_at timestamptz default now(),
  unique(van_id, product_id)
);

-- ACTIVITY LOG
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  van_id uuid references vans(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  product_name text not null,           -- snapshot so logs survive product deletion
  type text not null,                   -- 'issue' | 'return' | 'van-to-van' | 'depot' | 'adjust'
  quantity int not null,
  reference text,                       -- customer name, destination van, etc.
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Users can only see data from their own company
-- ============================================================

alter table companies    enable row level security;
alter table vans         enable row level security;
alter table profiles     enable row level security;
alter table products     enable row level security;
alter table stock        enable row level security;
alter table activity_log enable row level security;

-- Helper function: get the company_id of the logged-in user
create or replace function my_company_id()
returns uuid language sql stable security definer as $$
  select company_id from profiles where id = auth.uid()
$$;

-- Helper function: get the van_id of the logged-in user
create or replace function my_van_id()
returns uuid language sql stable security definer as $$
  select van_id from profiles where id = auth.uid()
$$;

-- COMPANIES: users see only their own company
create policy "company own" on companies
  for all using (id = my_company_id());

-- VANS: users see only vans in their company
create policy "vans company" on vans
  for all using (company_id = my_company_id());

-- PROFILES: users see all profiles in their company; can update their own
create policy "profiles read company" on profiles
  for select using (company_id = my_company_id());
create policy "profiles update own" on profiles
  for update using (id = auth.uid());

-- PRODUCTS: users see products in their company; managers can insert/delete
create policy "products read" on products
  for select using (company_id = my_company_id());
create policy "products write manager" on products
  for all using (
    company_id = my_company_id()
    and exists (
      select 1 from profiles
      where id = auth.uid() and role in ('manager','admin')
    )
  );

-- STOCK: technicians see all vans in company; can only modify their own van
create policy "stock read company" on stock
  for select using (
    van_id in (select id from vans where company_id = my_company_id())
  );
create policy "stock write own van" on stock
  for all using (van_id = my_van_id());

-- ACTIVITY LOG: all company members can read; insert allowed for own company
create policy "log read company" on activity_log
  for select using (company_id = my_company_id());
create policy "log insert" on activity_log
  for insert with check (company_id = my_company_id());

-- ============================================================
-- SEED DATA (optional — delete before going live)
-- ============================================================

-- Insert a test company
insert into companies (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Demo Gas Services Ltd');

-- Insert vans
insert into vans (id, company_id, van_number) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Van #04'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Van #07'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Van #12'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Van #15');

-- Insert products
insert into products (id, company_id, name, category, min_stock) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Oxygen E cylinder',     'Gas cylinder',      4),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Acetylene D cylinder',  'Gas cylinder',      3),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'CO2 cylinder (small)',  'Gas cylinder',      2),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Pressure regulator',   'Regulator',         3),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Hose assembly 5m',     'Fitting',           2),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Safety goggles',       'Safety equipment',  5);

-- Seed stock for Van #04
insert into stock (van_id, product_id, quantity) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 8),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 2),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 1),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 12),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 6),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 18);
