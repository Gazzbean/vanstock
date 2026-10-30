# Warehouse inventory – staged implementation (30 October 2026)

**Status: development draft. Not installed in Supabase or live VanStock.**

## Agreed operating model

Suppliers → Main Warehouse → Service vans → ServiceM8 jobs.

The warehouse is the principal inventory source. Van-to-van transfers are occasional. An Administrator controls each technician's authority; Managers and Administrators can operate warehouse stock. A technician may issue/receive stock only for the van assigned to their profile and only when the specific permission is granted.

## Compatibility decision

Current production `stock` rows refer to `van_id` only. Replacing this table immediately would disrupt existing dashboard, usage, and admin code. This stage therefore adds dedicated `warehouses` and `warehouse_stock` tables **without deleting or altering any van quantities**. An atomic stored procedure links warehouse and van balances.

This is an **intermediate design**, not the ultimate unified location ledger. All future stock mutations should migrate to a common transaction service and be tested together, since legacy `adjustStock` uses non-atomic read–modify–write. Never claim that concurrency integrity is complete while legacy functions remain active.

## Warehouse transaction types
- Purchase receipt → warehouse: future controlled goods-receipt workflow.
- Warehouse → van: `move_warehouse_van_stock`, direction `warehouse-to-van`.
- Van → warehouse: same RPC, direction `van-to-warehouse`.
- Van → customer job: existing issue flow until atomic RPC migration.
- Van → van: integrate/reconcile PR #2 before release.
- Stocktake adjustments: future audited warehouse and van counts.

## Database changes prepared
- `warehouses` scoped to a company, including one default Main Warehouse.
- `warehouse_stock` with nonnegative exact decimal quantities (NUMERIC(12,2)) and unique warehouse/product key.
- Transactional `move_warehouse_van_stock` with stock and log writes in one DB call.
- Checks company boundaries, product identity, role, per-user warehouse permission and assigned van.
- Public/anonymous table privileges revoked; authenticated can call only the controlled RPC.
- Requires `user_warehouse_permissions` migration from PR #3 **first**.

## Commissioning blockers
1. Review migration with Supabase Postgres SQL Editor in a staging/test project and take verified backups.
2. Confirm permissions migration, audited manager/admin assignment, and role policy are active.
3. Build manager warehouse-stock dashboard, approved opening-stock intake, and transfer form.
4. Replace old non-atomic stock-write functions and audit-log model before production. The current dashboard incorrectly adds unlike units, and must be adapted before activating decimal stock.
5. Apply the product UOM metadata migration **before** the warehouse-inventory stage. The latter changes existing stock and activity-log quantities from INTEGER to NUMERIC(12,2) without changing their values. Validate against current production schema in test first. Refrigerants remain one total kilogram balance per product and location, never per cylinder.
6. Test insufficient stock, zero/negative quantities, cross-company IDs, unprivileged users, assigned vans and simultaneous transfers.
7. Verify there are no gaps/duplicates in transaction logs, no double counting in dashboard totals, and accurate warehouse/van balances.

**Do not merge to main or apply migrations before coordinated integration testing.**

## Warehouse user interface integration (latest development)

- The warehouse screen now includes the opening-stocktake form and warehouse-to-van replenishment form.
- Each form displays product units (kg/m can use decimals, ea/pack/container use whole units).
- Both forms call session-authenticated server actions which invoke the role-checked PostgreSQL RPCs.
- All stock-changing actions are **disabled by default**, controlled by server-only `WAREHOUSE_WRITES_ENABLED=true`. Do not set this in production until all acceptance tests have passed.
- Starting balances are explicit, once-only warehouse stocktake transactions, with signed-off count references; no stocks are fabricated from existing van balances.
- This is source-code integration only. Database migrations and live end-to-end transaction tests have not been executed.

## Deployment checklist

1. Reconcile SQL migrations, foreign keys, RLS and permissions in disposable Supabase project.
2. Verify exact migration order and all existing stock quantities; do not rerun legacy seed schema.
3. Set test-only `WAREHOUSE_WRITES_ENABLED=true`; keep production unset.
4. Test positive and insufficient stock, decimal precision, duplicate opening posting, cross-company access, concurrency and rollback.
5. Verify stock and activity ledger accounting after each operation.
6. Check whether technicians need limited warehouse viewing/request screens before adding them.
7. Agree deployment and migration sequencing; repeat verified backup before any production database change.
