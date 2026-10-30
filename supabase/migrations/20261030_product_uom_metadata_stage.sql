-- VanStock: additive product unit metadata; STAGING ONLY.
-- Do not apply without review and backup. Does not modify existing balances.
begin;
alter table public.products
  add column if not exists stock_unit text not null default 'ea',
  add column if not exists stock_tracking_type text not null default 'ea',
  add column if not exists issue_increment numeric(12,3) not null default 1,
  add column if not exists min_issue_quantity numeric(12,3) not null default 1,
  add column if not exists package_capacity numeric(12,3),
  add column if not exists package_unit text;
commit;
-- Follow-up CHECK constraints and product mapping must be reviewed prior to commissioning.
-- Existing stock and log quantities are integers: fractional issues are NOT supported.
-- Agreed refrigerant design: one kg balance per refrigerant product and location.
-- Individual cylinder tracking is deliberately out of scope.
-- Other packaging behaviours remain subject to separate review.
