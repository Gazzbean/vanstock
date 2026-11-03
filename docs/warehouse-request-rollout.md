# Warehouse replenishment requests — draft review

**Not approved for live deployment or migration.** Apply in a test database first.

## Behaviour

1. A technician with `can_request` can request a warehouse product in stock units for an authorised van. This creates a `pending` request, not a stock transaction.
2. An administrator or manager reviews the request. Approval changes status to `approved` without modifying stock; rejection changes it to `rejected`.
3. An administrator or manager fulfils an approved request. The database locks the request, calls the existing transactional warehouse-to-van movement function and marks the request `fulfilled` in the same transaction. Duplicate fulfilment and insufficient stock must fail without an additional transaction.
4. Technicians see their own requests; managers see their company's queue. Request and fulfilment have separately recorded staff identities and timestamps.

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
- Deploy application and migration together only after Garry's explicit review and approval. Keep `WAREHOUSE_WRITES_ENABLED=false` until fulfilment is verified.

## Deferred — Users & Access nominated email

Garry requested that the nominated email address/invitation/login issue be made viable **at a later stage, when ready**. No email, sign-in, invitation, authentication or account-creation changes belong to this warehouse request update.
