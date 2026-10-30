# VanStock staging database preflight

Run `supabase/checks/warehouse-preflight-readonly.sql` **in an isolated Supabase test project** before applying staged warehouse migrations.

**Do not apply the migrations to production from this checklist.**

1. Verify product, stock, log and profile columns.
2. Record table row counts, negative balances and any duplicate stock pairs.
3. Compare schema information to the tested migration sequence.
4. Apply staged migrations in order: warehouse permissions (PR #3), product unit **and archived_at column**, warehouse inventory/decimals, product archive/restore function, atomic van actions, opening warehouse stock, direct-write restriction. The warehouse RPC reads archived_at, so the metadata column must be present before creating that RPC.
5. Confirm permissions and RLS using signed-in administrator/manager/technician test accounts; SQL Editor superuser access does **not** prove those role restrictions.
6. Use physical stocktake test data to test kg, m, and ea, duplicate opening balance, over-withdrawals and simultaneous transfer attempts. Include direct RPC calls with 1.2345 kg; the arguments must remain unconstrained NUMERIC until the explicit precision check rejects them.
7. Test a failed transaction and verify neither balance nor activity log changed.
8. Check application forms and dashboards against the test database.
9. Keep `WAREHOUSE_WRITES_ENABLED` absent/false in production; enable only for controlled test environment.

**Unresolved release blocker:** no isolated Supabase test project or actual database execution has been completed through GitHub. Source review and Vercel build passing are not end-to-end verification.

## Product archive acceptance tests
- Product with a positive van or warehouse balance cannot be archived.
- Product with zero balances can be archived, stays present in Admin and historical logs, and disappears from new operational product selectors.
- Archived product cannot be moved or adjusted via any secured stock transaction RPC.
- Manager/Admin can restore an archived product; technician cannot archive or restore.
- Concurrent archive and stock mutation must not create a positive archived balance; product-row locking is included in the staged action functions.
- Product deletion remains prohibited; no rows are removed by archiving.
- This feature is release-gated by the same test-only WAREHOUSE_WRITES_ENABLED flag.
