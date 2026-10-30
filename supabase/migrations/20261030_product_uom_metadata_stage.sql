-- VanStock: simple product unit of measure. STAGING ONLY.
-- Existing products default to each (ea); verify each product against its physical stock.
-- No existing quantity balances are modified by this migration.
begin;

alter table public.products
  add column if not exists stock_unit text not null default 'ea';

alter table public.products
  add constraint products_stock_unit_valid
  check (stock_unit in ('ea', 'kg', 'm', 'pack', 'container'));

commit;

-- Refrigerants: one stock balance in kg per refrigerant type and location.
-- No cylinder identifiers, package capacity or separate cylinder counts.
-- Fractional transactions remain unavailable until the warehouse/van
-- NUMERIC migration and transactional stock actions are installed and tested.
