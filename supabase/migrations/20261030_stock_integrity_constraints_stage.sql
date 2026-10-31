-- VanStock staged integrity constraints: TEST DATABASE ONLY.
-- Run after stock migration, and only after the read-only preflight confirms
-- no negative balances. Any failure rolls back this whole migration.
begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stock'::regclass
      and conname = 'stock_quantity_nonnegative'
  ) then
    alter table public.stock
      add constraint stock_quantity_nonnegative check (quantity >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_min_stock_nonnegative'
  ) then
    alter table public.products
      add constraint products_min_stock_nonnegative check (min_stock >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activity_log'::regclass
      and conname = 'activity_log_quantity_nonnegative'
  ) then
    alter table public.activity_log
      add constraint activity_log_quantity_nonnegative check (quantity >= 0);
  end if;
end;
$$;

commit;

-- Direct database constraints are defence-in-depth, not a replacement for
-- authenticated, transactional RPCs. The constraints check existing rows
-- before becoming effective; existing negative data must be reconciled.
