# Warehouse replenishment requests — draft review

**Not approved for live deployment or migration.** Apply in a test database first.

**Safety gate:** Warehouse writes and catalogue archiving now require the literal
server-side setting `WAREHOUSE_WRITES_ENABLED=true`. An unset or misspelled value
must leave them disabled. Approval/rejection of requests does not itself move stock.

## Behaviour

1. A technician with `can_request` can request a warehouse product in stock units for an authorised van. This creates a `pending` request, not a stock transaction.
2. An administrator or manager reviews the request. Approval changes status to `approved` without modifying stock; rejection changes it to `rejected`.
3. An administrator or manager fulfils an approved request. The database locks the request, calls the existing transactional warehouse-to-van movement function and marks the request `fulfilled` in the same transaction. Duplicate fulfilment and insufficient stock must fail without an additional transaction.
4. Technicians see their own requests; managers see their company's queue. Request and fulfilment have separately recorded staff identities and timestamps.
5. Queue history shows the full name and initials of requester, reviewer and fulfiller, with status filters for open, fulfilled, rejected or all requests. Successful actions refresh the page automatically.

## Permission policy and limitation

- `can_request` is enforced in the server action **and** database RPC for technicians.
- `vanstock_warehouse_move`, `vanstock_warehouse_adjust` and `vanstock_warehouse_opening_stock` are newly permission-gated entry points. The old RPCs lose direct `authenticated` execution rights. Existing stock movement and audit logic is preserved inside the legacy functions, called by the wrappers.
- `can_issue` and `can_receive` are checked in the UI, server actions and SQL wrappers. A technician with an explicit grant can use a limited stock movement form on My Van Stock, **only for their assigned default van**. Managers and administrators retain their existing role-based warehouse authority. The request form separately supports authorised temporary working vans.
- `can_adjust` and `can_stocktake` remain management-only. Their technician checkboxes are disabled rather than suggesting an unimplemented privilege. A technician counting/adjustment workflow needs separate design and review.
- The existing direct warehouse-to-van form remains available to management alongside the new request queue for controlled corrections and direct wholesaler collections. Consider whether direct replenishment should require an approved request before production.

## Release checklist

- Back up live Supabase and test the migration first; verify existing inventory and logged movements are unchanged.
- Confirm the approved policy for office-only staff and technician access to temporary vans before broadening the management-only functions.
- Verify old direct RPCs are no longer callable as `authenticated`, while manager wrappers and approved technician issue/receive calls still succeed and preserve audit attribution.
- Verify technician request, unauthorised-van denial, manager approval, rejection, insufficient warehouse stock, duplicate fulfilment, ledger attribution and reports in a preview environment.
- Isolated PostgreSQL tests now install **the real warehouse inventory/movement migration**, request migration and RPC-permission migration together. They exercise the genuine stock transfer and audit logging function (no substitute), including exact one-time movement, manager attribution, insufficient-stock rollback, cross-company denial, archived-product denial and whole-unit validation. This proves these SQL paths work in the isolated test schema, **not** that a live authenticated browser or production Supabase installation has been verified. Vercel's successful build status is not a stock-workflow acceptance test.
- Another Supabase project is visible in the account, but its name does not identify it as a VanStock test database. Do not alter or repurpose it without confirming ownership and purpose; continue using isolated PostgreSQL until a dedicated test database is approved.
- Deploy application and migration together only after Garry's explicit review and approval. Keep `WAREHOUSE_WRITES_ENABLED=false` until fulfilment is verified.

## Deferred — Users & Access nominated email

Garry requested that the nominated email address/invitation/login issue be made viable **at a later stage, when ready**. No email, sign-in, invitation, authentication or account-creation changes belong to this warehouse request update.
