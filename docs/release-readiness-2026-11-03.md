# VanStock release readiness — 3 November 2026

**Status: draft release, no production migration or deployment approved.**

## Verified

- The GitHub draft PR builds successfully on Vercel.
- Isolated PostgreSQL regression coverage tests receiving, pack conversion,
  stock movements, request/approval/fulfilment, permissions, audit and rollback.
- Read-only inspection of the designated live Supabase project confirms the
  original inventory and access tables, and the prerequisite composite product
  key, exist.
- Read-only preflight returned zero duplicate van identifiers, conflicting
  supplier package definitions, orphaned assignments and negative balances.
- No dedicated Supabase development branch currently exists. Isolated PGlite
  testing does **not** establish authenticated end-to-end browser behaviour.

## Migrations still absent from production (apply in this order)

1. `20261103040354_package_option_lifecycle_and_authorized_receiving.sql`
2. `20261103060000_warehouse_replenishment_requests.sql`
3. `20261103070000_warehouse_rpc_permission_gate.sql`
4. `20261103080000_vehicle_register.sql`
5. `20261103081000_warehouse_stock_thresholds.sql`
6. `20261103082000_catalogue_import_metadata.sql`
7. `20261103083000_working_van_selection_audit.sql`
8. `20261103084000_legacy_helper_security_hardening.sql`

The warehouse release flag remains fail-closed unless
`WAREHOUSE_WRITES_ENABLED` is exactly `true`.

## Preconditions for live deployment

1. Obtain a restorable database backup and document an exact restore plan.
2. Apply all migrations to a disposable database matching production structure
   and test RLS/session behaviour with distinct Admin, Office, Technician and
   Apprentice accounts. Do not use the unrelated Supabase project as a test DB.
3. Exercise the full sequence: imported catalogue, supplier pack of 500,
   receipt of 500 ea, warehouse stock, request, manager approval,
   fulfilment, van issue of 20 ea, 480 ea remaining.
4. Confirm Office/Admin can view **all** active vans including unallocated
   vans without changing Working Van; technician cannot query another van.
5. Confirm technician can select only authorised vans, audit shows previous
   and selected van exactly once, and switching does not move stock.
6. Confirm duplicate reference/idempotency, inactive user, archived product,
   empty balance and cross-company requests are rejected.
7. Compare before/after live balances and sample activity history, then deploy
   the matching Vercel build. Keep warehouse writes disabled until smoke tests
   and authorisation pass.

## Outstanding scope deliberately not in this release

- Automatic ServiceM8 billing/synchronisation, purchasing/reorder workflow,
  and full monthly stocktake process are subsequent phases.
- Email-based user invitations and setup-link reliability should receive a
  separate acceptance pass before general staff onboarding.
