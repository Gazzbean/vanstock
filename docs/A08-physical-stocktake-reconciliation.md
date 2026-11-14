# A08 — Physical stocktake, reconciliation and cutover controls

**Status:** Physical counts and operational approval **not complete**.
**Method selected for first release:** Controlled **manual** physical count and
two-person verification. Do not build or activate automatic count posting as
an unreviewed substitute. The separate DEV-029 issue (#49) remains open for a
future full audited van count-session workflow.

## 1. Evidence baseline — 14 November 2026

Read-only Supabase project `aqdwqargcjnhvupwtjcr`.
Snapshot of product/location balance pairs: **14 November 2026 16:49 AWST**.

| Measure | Observed |
|---|---:|
| Active products | 7 |
| Active vans | 4 |
| Warehouses | 1 |
| Product × location combinations to physically verify | 35 |
| Existing van-stock balance records | 15 |
| Existing warehouse balance records | 2 |
| Product/location combinations without a balance record | 18 |
| Warehouse opening-entry records | 2 |
| Warehouse issued commitments at snapshot | 0 |
| Negative stock rows | 0 |
| Stock activity history records | 35 |

**Important:** "no row" must never be silently converted to a counted zero.
A recorded 0.00 balance is different from an unrecorded product/location.
All physical counts start blank; an uncounted field is different from counted
zero. The spreadsheet snapshot is a read-only working document, **not a
posting/import file or a system-generated stocktake approval.**

At this snapshot the two warehouse opening entries are explicitly labelled
`TEST-OPENING-001` (Safety goggles; original 5) and `TEST-WH-001`
(TEST – Cable Ties 500pk; original 20). Current recorded warehouse
quantities are 0 and 3 respectively. These **test-labelled** opening entries
are not evidence of an independently verified physical opening stocktake.

**Catalogue exception:** A product is named `TEST – Cable Ties 500pk` but
its stored stock unit is `ea`. Confirm whether one stock unit means an
individual cable tie or one 500-piece pack. Avoid converting one to the
other by assumption. Four products are explicitly named cylinder/related
items, with the current catalogue counting cylinders as `ea`. The separate
supplier-cylinder custody, serial and hire/rental decision belongs to A10.

## 2. Scope and boundary

1. Count the warehouse and all four active vans, by **product and exact
   stored unit**; do not add quantities measured in unlike units.
2. Record physical shelf stock, any goods held at customer site, allocated
   to jobs, quarantined/damaged and in transit separately. An A03 committed
   issue is unavailable and should not be counted as a shelf item if already
   physically dispatched.
3. Exclude stock that belongs to suppliers or customers unless a documented
   custody/ownership rule includes it. Record custody exceptions instead.
4. Do not infer new warehouse balance from van quantities, earlier invoices,
   order packs or historical test transactions.
5. Do not change `WAREHOUSE_WRITES_ENABLED`, adjust user grants or execute
   production count corrections while planning or counting.

## 3. Count preparation — owner: stock controller

- Agree one stocktake batch reference, warehouse/van location owners, date
  and cut-off time in **Australia/Perth**. Note the Vercel production SHA and
  Supabase project reference; confirm the environment.
- Identify and pause physical stock movements at each location, including
  transfers, job issues, purchase receipts, warehouse dispatches and returns.
  If freezing is not feasible, maintain a signed movement register with exact
  timestamps and reconcile forward to the common cut-off.
- Confirm product names, UOM, packaging, 500-pack conversion, cylinder
  ownership and blank/zero treatment before approval.
- Provide the read-only A08 count workbook separately to counters. A new
  snapshot must be taken if movements have occurred since the workbook was
  generated; the workbook is **not live connected** to Supabase.
- Appoint a primary counter and an independent checker for each location.
  The checking person must not sign off their own unverified adjustment.

## 4. Counting and comparing

- For each of 35 product/location lines, enter a **physical quantity**,
  including explicit zero when physically verified absent.
- Count products that do not currently have a balance row; retain them as
  `Missing ledger line` rather than overwriting them with zero.
- Record item bin/shelf, count notes, isolated damaged/obsolete goods and
  evidence for each exception.
- Only compare against `Recorded – Committed` if warehouse stock has been
  physically dispatched but the recipient has not confirmed receipt.
  Separately reconcile each A03 issue-in-transit.
- The register calculates `Physical – Expected onsite` where the ledger
  row exists; blank counts do not generate variances.
- Review significant or unexpected variances against historical movement
  references. Investigate the `TEST – Cable Ties 500pk` unit and legacy
  test-labelled opening stock before any correction proposal.
- A partial count is **not** a complete location reconciliation.

## 5. Approval — no automatic stock changes

The signed count and investigated variance worksheet are the basis of an
**approval decision**, not a database transaction. For each line that needs
a change, document:
- Location, product, stored unit and old *freshly read* ledger balance.
- Physical count, delta and explanation, including identified test data.
- Counter, independent checker, authorised approver, timestamps and batch ID.
- Whether a ledger row exists and whether outstanding allocations,
  warehouse commitments, in-transit and customer/job stock were accounted for.
- Approved correction type and the reference that must appear in VanStock
  Transaction History.

**Approval matrix:**
- Technician or apprentice: may count their authorised Working Van; **may not**
  self-post reconciliation adjustments.
- Warehouse verified count: Administrator or Manager granted the independent
  `stocktake_warehouse` permission; subject to independent count approval.
- Van count adjustments: existing `vanstock_admin_adjust_van` requires
  Administrator. Do not bypass this by direct SQL or a new unreviewed RPC.
- The current direct "Set verified count" UI does **not** itself hold the
  signed source document or provide a two-person approval workflow. Preserve
  offline approval evidence until DEV-029 is implemented and accepted.

## 6. Controlled posting — only after approval

1. Acquire a **fresh** read-only live balance and all outstanding A03
   commitments; compare with the signed snapshot. Reject a stale count and
   recount or reconcile intervening movements first.
2. If an existing warehouse row/warehouse-opening entry exists, **never**
   re-run one-time opening stock. Use only the authorised, reasoned,
   audit-logged warehouse correction appropriate to the approval.
3. For a product/location with no warehouse row, do not assume a zero
   opening balance. An approved first physical count may use a one-time
   opening entry only after identity, ownership and UOM checks; zero count
   must still be intentionally approved.
4. Van balances are corrected with the Administrator-only van correction
   RPC; do not use supplier receipt, customer issue or van transfer to make
   inventory artificially match.
5. Apply each approved line once. Stop on error; do not blind-retry after
   a timeout. Re-read the balance and Transaction History to determine
   whether the first operation succeeded.
6. Reconcile all post-change balances to signed counts with per-item and
   per-location totals **without summing unlike units**.
7. Keep immutable count evidence, approval, references, transaction history,
   unresolved exceptions and count coverage in the controlled project folder.
   All material unresolved variances require an accountable owner and
   operational acceptance decision.

## 7. Verification / release gates

**A08 Phase 1 (preparation):** read-only baseline, repeatable count workbook,
written procedure, existing opening-entry/test data review: complete.

**A08 Phase 2 (physical sign-off): OPEN**
- [ ] Company confirms warehouse and all active van counters/checkers.
- [ ] Product identities, units and test-labelled data disposition approved.
- [ ] All 35 product/location pairs explicitly counted or documented as
      approved exclusions; blank remains not counted.
- [ ] Every variance investigated, supported and independently signed.
- [ ] Opening versus adjustment treatment established per product/location.
- [ ] All approved corrective writes performed through correct authorised RPC.
- [ ] Fresh post-count snapshot and transaction history reconciled; no
      unexplained negative stock, duplicate adjustment or issue in transit.
- [ ] Pilot location balances signed off; remaining unresolved exceptions
      recorded with an owner before operational cutover.

**DEV-029 automatic stocktake:** Open issue #49; do not treat as delivered
merely because the manual workbook and existing adjustment forms exist.
Implement draft count batches, reviewer decisions, stale-snapshot rejection
and atomic posting separately with isolated database tests.

## 8. Rollback and incident handling

If an incorrect correction is found, **do not restore a historical database
dump blindly** or delete a posted audit event. Stop movements, export
current read-only stock and history, investigate the error, obtain a new
authorisation and apply a compensating audited correction referencing the
original. Database restoration is an incident/recovery decision requiring
separate approval and consideration of all movements since the backup.

## Important references

- `docs/warehouse-opening-stock-procedure.md` is an older staged document
  with obsolete assumptions (e.g. claims of integer-only quantities and
  undeployed opening functions). Follow **this A08 procedure** for current
  operational planning and verify live source before posting.
- `docs/warehouse-inventory-development.md` is also a historical design
  record; its "not installed" statements are no longer current.
- DEV-029: https://github.com/Gazzbean/vanstock/issues/49.
- The A08 spreadsheet with live snapshot must remain a **controlled offline
  handover artifact**. Do not publish counted quantities or personal sign-off
  details in a public repository.
