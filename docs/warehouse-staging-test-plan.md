# VanStock staging database preflight

Run `supabase/checks/warehouse-preflight-readonly.sql` **in an isolated Supabase test project** before applying staged warehouse migrations.

**Do not apply the migrations to production from this checklist.**

1. Verify product, stock, log and profile columns.
2. Record table row counts, negative balances and any duplicate stock pairs.
3. Compare schema information to the tested migration sequence.
4. Apply staged migrations in order: warehouse permissions (PR #3), product unit, warehouse inventory/decimals, atomic van actions, opening warehouse stock, direct-write restriction.
5. Confirm permissions and RLS using signed-in administrator/manager/technician test accounts; SQL Editor superuser access does **not** prove those role restrictions.
6. Use physical stocktake test data to test kg, m, and ea, duplicate opening balance, over-withdrawals and simultaneous transfer attempts.
7. Test a failed transaction and verify neither balance nor activity log changed.
8. Check application forms and dashboards against the test database.
9. Keep `WAREHOUSE_WRITES_ENABLED` absent/false in production; enable only for controlled test environment.

**Unresolved release blocker:** no isolated Supabase test project or actual database execution has been completed through GitHub. Source review and Vercel build passing are not end-to-end verification.
