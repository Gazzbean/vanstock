# Decimal stock integrity – development checks

Status: SOURCE REVIEW ONLY. No database tests have run. Do not apply to production.

## Findings
- Original stock.quantity, activity_log.quantity and products.min_stock are INTEGER; the draft migration changes these to NUMERIC(12,3).
- Corrected a draft SQL GRANT that incorrectly referred to the old INTEGER RPC signature.
- Legacy adjustStock and recordTransfer use separate read/write/log steps, exposing race conditions and missing-log risks.
- adjustStock clips over-removal to zero rather than rejecting insufficient stock.
- Dashboard totalItems and issuedToday add quantities across unlike units; this is misleading once kg and m are introduced.
- Existing products default to ea. Confirm correct units against actual stock before changing any product classification.
- Warehouse opening balances require approved physical counts.

## Required tests in a separate test database
1. Apply warehouse permissions, product unit metadata, and warehouse inventory migrations in dependency order.
2. Compare existing stock and activity-log quantities before and after conversion; check exact preservation.
3. Verify all SQL function signatures, RLS, company isolation, and role grants.
4. Reject 1.5 ea; accept 2.500 kg and 1.250 m; reject zero, negatives and invalid precision.
5. Transfer 2.500 kg warehouse to van, checking equal debit and credit and complete audit logging.
6. Return 1.250 kg van to warehouse with equal debit and credit.
7. Reject insufficient source stock with no balance or log change.
8. Force transaction failure after debit and verify complete rollback.
9. Reject cross-company resources and unauthorised technician requests.
10. Run concurrent withdrawals and verify no negative balances or lost updates.
11. Check dashboard, stock pages, transfer forms and activity logs for correct units and no mixed-unit totals.
12. Confirm end-to-end behaviour with test users; a successful Vercel build alone is insufficient.

## Product retirement risk
The existing original schema defines stock.product_id with ON DELETE CASCADE. A previous manager product-delete action could silently remove associated van stock. Product deletion has been suspended in the development branch, and must remain blocked until a non-destructive archive/deactivation workflow is built, with explicit handling of stock already held. The production app has not yet received this safeguard.

## Release gate
Never enable stock-changing warehouse operations until the legacy stock actions have been replaced by safe transactional operations and these checks have passed.