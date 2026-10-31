# VanStock — No-cost validation route

**Decision (31 October 2026):** Do not create a paid Supabase development branch. Do not apply any warehouse migrations to either existing Supabase project.

## What can be verified now without a database
1. Run the repository static checks: `node scripts/check-warehouse-stage.mjs` in a checkout of `feature/warehouse-inventory`.
2. Review the staged SQL in `supabase/migrations/` and compare with the preflight outputs before executing anything.
3. Confirm Vercel builds the development branch. A green Vercel build does **not** prove SQL runs or RLS restrictions work.
4. Inspect user forms for two decimal places in kg/metres and whole numbers in ea/pack/container.

## Safe database test options later
- **Local PostgreSQL / local Supabase:** No Supabase hosted branch charge. A local setup must include the Supabase auth roles and schemas required for `auth.uid()` and `SECURITY DEFINER` functions. Generic blank PostgreSQL alone is insufficient for full integration tests.
- **Existing separate nonproduction Supabase project:** Only after confirming that project's purpose and that its data can be replaced; do not assume the other project listed in the organisation is disposable.
- **Paid development branch:** Explicitly declined; do not create it without a new decision.

## Mandatory acceptance tests before release
- Migration install order, no missing tables/functions, and `numeric(12,2)` schema confirmed.
- Exact two-decimal quantities (`1.23` accepted, `1.234` rejected without rounding); whole-item units reject fractions.
- Opening warehouse counts, including zero and duplicate-post prevention.
- Warehouse-to-van and van-to-warehouse conservation, with one movement log entry.
- Insufficient stock and failed transactions roll back both locations and the log.
- Concurrent transactions cannot overdraw stock.
- Archived products preserve balances/history; only zero-balance products may archive.
- Technician access restricted to assigned van, with separate warehouse permissions.
- Direct SQL writes inaccessible to anon/authenticated; RPCs deny cross-company or unauthorised requests.
- Staging stocktake test data never sent to production.

**Release blocked:** No isolated database execution and authenticated end-to-end tests have been completed. Do not merge PR #4 or enable stock-changing warehouse features based on static checks alone.
