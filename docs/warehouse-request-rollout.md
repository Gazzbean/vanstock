# Warehouse replenishment requests — draft review

**Not approved for live deployment or migration.** Apply in a test database first.

## Behaviour

1. A technician with `can_request` can request a warehouse product in stock units for an authorised van. This creates a `pending` request, not a stock transaction.
2. An administrator or manager reviews the request. Approval changes status to `approved` without modifying stock; rejection changes it to `rejected`.
3. An administrator or manager fulfils an approved request. The database locks the request, calls the existing transactional warehouse-to-van movement function and marks the request `fulfilled` in the same transaction. Duplicate fulfilment and insufficient stock must fail without an additional transaction.
4. Technicians see their own requests; managers see their company's queue. Request and fulfilment have separately recorded staff identities and timestamps.

## Permission policy and limitation

- `can_request` is enforced in the server action **and** database RPC for technicians.
- Existing `move_warehouse_van_stock` remains the authority for physical stock transfers; managers and administrators retain their existing role-based access. Its legacy technician branch already checks `can_issue`/`can_receive` for the **default** van. The new request form uses the separately maintained authorised working-van list.
- `can_adjust` and `can_stocktake` settings have not yet been migrated into the legacy database adjustment/opening stock functions. Do **not** describe all six tick boxes as fully implemented capabilities until that separate permission audit and migration are complete.
- The existing direct warehouse-to-van form remains available to management alongside the new request queue for controlled corrections and direct wholesaler collections. Consider whether direct replenishment should require an approved request before production.

## Release checklist

- Back up live Supabase and test the migration first; verify existing inventory and logged movements are unchanged.
- Confirm the appropriate role/permission policy for manager, office and technician warehouse operations; reconcile the legacy RPCs with the permission register before enabling warehouse writes.
- Verify technician request, unauthorised-van denial, manager approval, rejection, insufficient warehouse stock, duplicate fulfilment, ledger attribution and reports in a preview environment.
- Deploy application and migration together only after Garry's explicit review and approval. Keep `WAREHOUSE_WRITES_ENABLED=false` until fulfilment is verified.

## Deferred — Users & Access nominated email

Garry requested that the nominated email address/invitation/login issue be made viable **at a later stage, when ready**. No email, sign-in, invitation, authentication or account-creation changes belong to this warehouse request update.
