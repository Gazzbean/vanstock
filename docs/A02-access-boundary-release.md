# A02 Access Boundary Hardening — controlled release plan

Status: **STAGED FOR REVIEW; PRODUCTION DATABASE UNCHANGED**.
Baseline: `main` 0667cf9; 14 November 2026.

## Verified security evidence
- The current authenticated Manager with no Office capability has 2 authorised vans. Read-only role impersonation retrieved 15 stock rows versus 14 in authorised vans, and 35 activity rows versus 27 in authorised vans.
- `vans` grants permit authenticated INSERT/UPDATE/DELETE/TRUNCATE. A company-scoped FOR ALL policy does not implement the intended vehicle-maintainer grant.
- `products` has a direct Manager FOR ALL policy while the application uses a separately configurable maintain-catalogue permission.
- `my_company_id()` and `my_van_id()` do not test whether an account is inactive.
- Existing application server actions enforce the intended roles for fleet reads and vehicle changes using service-role access.
- Existing service_role grants were independently verified as present.

## Business access model used by this draft
- Active Administrator: read all company vans, their stock and history.
- Active Office capability: read all company van stock and history, including Office users with a Technician base role.
- Active Technician capability without Office: read only individually authorised vans and those vans' history.
- Manager without Office: no company-wide inventory visibility by default; see assigned vans if Technician capability is enabled.
- All other/inactive/anonymous sessions: no direct sensitive table reads.
- Vehicle and product edits: server-authorised actions only. The browser database role has no direct INSERT/UPDATE/DELETE/TRUNCATE privileges.
- No changes to the app's user interface, stock quantities, movement RPCs, Manager grants, or warehouse release setting.

## Before approving migration
1. Confirm user permissions/business access model above.
2. Back up the database and export existing policies/grants/function definitions (restore point).
3. Validate SQL on isolated Supabase test database. Test allowed/denied RLS cases with identities for Admin, Office, Manager Technician, restricted Technician, inactive, and anonymous.
4. Confirm van/profile/stock/activity_log and product workflows still work with existing authenticated session RPCs and service-role server actions.
5. Validate manager/technician cannot directly mutate van/product tables, even with crafted API requests.
6. Review Supabase security advisors and database logs.

## Controlled application
- Migration is one atomic transaction; if it fails, nothing should be committed.
- Apply only after access test matrix and business rules are signed off.
- Immediately execute `supabase/checks/a02_role_scope_readonly.sql`. Verify no authenticated direct DML and read scopes match authorisations.
- Verify authorized staff sign-in, Fleet Stock (Office), My Van Stock (Tech), historical activity, Manager vehicle edit, administrator catalogue.
- Production smoke checks are read-only where possible, and do not change inventory.
- If regression occurs, hold production and restore verified backed-up grants/policies/function definitions in a separate, approved rollback. Do not blindly reinstate broad grants.

## Scope boundaries
A04 manager warehouse approval/issue/receipt split is **not** changed by this security patch.
A01 production warehouse flag and environment isolation are separate decisions.
No SQL in this branch has been applied to the live database.
