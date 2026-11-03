# VanStock stock-integrity review – staged rollout

Status: **review branch only**. Do not deploy the app code before the corresponding SQL migration is applied. Do not apply the migration or change live test stock until Garry approves the review.

## Included

1. Package options can be retired/reactivated without deleting historical pack receipts. Retired options are hidden from receiving and rejected by the database.
2. Full packs must be whole-number counts; one 500-pack adds 500 `ea` when the selected purchase option says 500 units per pack.
3. A technician may receive packs and loose items into any individually authorised Working Van. Office users retain their existing company-wide receiving scope.
4. My Van Stock and Dashboard use the per-van minimum/target, including zero-balance mandatory/preferred items; the product-wide minimum remains a fallback where no van standard exists.
5. Receiving and Transaction History respect the authorised Working Van selector. Estimated consumables state resets on a van change.
6. Active is now directly beside the user name in Users & Access.

## Test evidence

- `npm test`: isolated PGlite tests for the proposed SQL migration and stock status rules.
- `npx tsc --noEmit`: type checking.
- `npm run build`: Next.js production build with dummy (non-live) Supabase environment values.

The isolated database tests validate SQL transaction behavior but do not replace live Supabase Auth/RLS tests. Docker/Supabase local stack is not available in the review execution environment.

## Release order after approval

1. Confirm a current recoverable database backup and review the migration SQL.
2. Apply `20261103040354_package_option_lifecycle_and_authorized_receiving.sql` to the **Vanstock** Supabase project. The migration only adds metadata/index/trigger and updates receiving RPC definitions; it does not alter stock balances or historical receipts.
3. Confirm `supplier_product_options.active` exists and is true for existing options, then run security/performance advisors.
4. Deploy this matching app version to Vercel. Avoid deploying code that expects the `active` field before step 2.
5. In Admin → Suppliers & bins, select `TEST – Cable Ties 500pk` and retire the incorrect `500 – 1 ea per pack` option. Keep the valid `500 pk – 500 ea per pack` option active.
6. Reconcile the physical test receipt `Testing 1` for Van #3. If one full 500-pack was actually received, enter an authorised audited **+499 ea** correction with the reference `TEST-PACK-CONVERSION-CORRECTION`; do not modify or delete the original receipt.
7. Test Chris (Technician, Van #3), Garry (Administrator), and the Office-only test user. Verify authorised Van selection, receiving, stock/usage, history, dashboard and forbidden actions.
8. If any test fails, stop stock-changing operations and diagnose before expanding use. Do not reset test data without a separate confirmed procedure.

## Intentionally not included in this change set

- Van-to-van physical transfer implementation.
- Cylinder serial/rental lifecycle.
- ServiceM8 posting or billing.
- Separate general hardening of catalogue-delete permissions and unrelated Supabase advisor findings.
- Redesign of stock adjustment permissions, duplicate-docket rules or Dashboard Perth-day totals.

These are subsequent controlled tasks; the existing approved stock philosophy remains unchanged.
