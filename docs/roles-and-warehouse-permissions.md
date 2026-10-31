# VanStock — Account roles and warehouse permissions
Status: Agreed design (30 October 2026). Not yet deployed.

## Three account roles

| Capability | Administrator | Manager | Technician |
| --- | --- | --- | --- |
| View own van stock and log job usage | Yes | Yes | Yes |
| View fleet / warehouse inventory | Yes | Yes | Configurable |
| Request van replenishment | Yes | Yes | Yes (default) |
| Issue warehouse stock to vans | Yes | Yes | Optional, granted per user |
| Receive returns into warehouse | Yes | Yes | Optional, granted per user |
| Stocktake warehouse | Yes | Yes | Optional, granted per user |
| Adjust warehouse stock quantities | Yes | Yes, reason mandatory | Optional, individually authorised |
| Manage product catalogue and minimum stock | Yes | Yes | No |
| Manage user account roles and stock permissions | Yes | No | No |
| Access permission-change audit | Yes | Read-only (future) | No |

A user has exactly one base role: admin, manager, or technician. Additional technician warehouse privileges are stored individually, granted by an Administrator.

## Principles
- Initial primary Administrator: Garry, after explicitly verifying the correct Supabase Auth user and profile.
- Managers may operate warehouse inventory but **cannot grant or change permissions**.
- Default technician warehouse permissions: can_request=true; can_view=false; can_issue=false; can_receive=false; can_adjust=false; can_stocktake=false.
- Administrators and Managers should have operational warehouse permissions by role regardless of per-user technician flags.
- Changing roles and permissions must require server/database authorization; hiding a button is not security.
- Record user identity, source location, destination location, product, quantity, time and optional job/reference on every transaction.
- Every stock movement affecting two locations must be atomic. Reject insufficient stock and cross-company transfers.
- Stocktake adjustments require reasons and audit entries, including previous and new quantity.
- Warehouse is the primary source for van restocking; van-to-van transfers are occasional exceptions.
- Do not start using the new warehouse permissions UI until database migration, role-based security and tests are complete.

## Important discovered security concern
The original `supabase-schema.sql` includes an RLS policy named `profiles update own` that permits authenticated users to update their own profile row without limiting writable columns. Depending on live database privileges and policies, this could allow a technician to change their role. Review and replace this policy **before** allowing live self-service role management. Never permit clients to update `role`, `company_id`, or `van_id` directly.

## Commissioning sequence
1. Inspect live Supabase `profiles` and `pg_policies` to verify which policies exist and which user ID belongs to Garry.
2. Back up the database and validate a replacement role-management policy/migration.
3. Promote only the verified Garry profile from manager to admin, preserving company and van assignment.
4. Install the warehouse permission tables and audited RPC.
5. Verify admin, manager and technician permissions with separate test accounts.
6. Implement physical warehouse stock-location ledger and atomic transfers.
7. Release only after development tests, review and approval.

## Parallel work
Pull Request #2 contains the prototype van-to-van transfer. It should be reconciled into the common warehouse-and-van stock-location model; do not merge it as-is.
