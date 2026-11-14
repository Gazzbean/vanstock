# A10 – Refrigerant kg and physical cylinder custody

**Phase:** Cylinder register development, not physical-custody sign-off.
**Basis:** Comprehensive Technical Audit A10, 15 November 2026.
**Decision:** Maintain refrigerant-content movement and supplier-cylinder custody
**as separate, reconciled records**. This is not an automatic supplier
billing or ARC reporting integration.

## Observed system baseline

- The live VanStock product catalogue has seven active products and
  currently lists Acetylene D cylinder, CO2 cylinder (small) and Oxygen E
  cylinder as `Gas cylinder` products with stock unit `ea`.
- The existing generic stock ledger tracks counts/quantities by product and
  location. It does NOT have a serial number, cylinder ownership, physical
  custody return, supplier rental deadline or test/inspection record.
- Current records are development/test data; **do not automatically backfill
  serials or assert physical possession from a product quantity**.
- No refrigerant-by-type kg movement stream, cylinder weighbridge balance,
  recovered gas inventory, ARC reporting, supplier rental invoice
  reconciliation, lease document or supplier return docket has been
  inspected/implemented by this A10 package.

## First-release design

1. **Physical cylinder identity:** One uniquely registered serial within
   the company, gas label, supplier ID, ownership, nominal capacity kg (if
   known) and actual receipt date. Serial uniqueness is case and surrounding
   whitespace insensitive. Do not treat nominal cylinder size as the measured
   contents or as an `ea` stock count.
2. **Custody:** Location `warehouse / van / customer site / supplier / unknown`,
   plus `in custody / return pending / returned / unaccounted`.
   Active-van and same-company warehouse/supplier checks are performed
   server side; database cross-company supplier FK adds an independent
   constraint.
3. **Supplier terms:** Optional explicit dates for rent-free end, contractual
   return due and rental/forced-sale review. Enter dates **only** from the
   supplier agreement, citing its purchase order, contract or account
   reference. No guessed 3-, 6- or 18-month dates and no automatic title
   transfer, forced sale or invoicing event. A due date is a review alert.
4. **Inspection:** Last documented leak check and supplier test-due date;
   manual entry with supporting reference. An empty date means
   **unverified**, not automatically compliant. Generic oxygen/acetylene
   entries do not automatically inherit refrigerant-specific requirements.
5. **Immutable audit:** Any registration or change creates a time-stamped
   before/after event containing actor and audit reference. Entry deletion
   and audit rewrites are blocked; stale record versions are rejected.
6. **Access:** Administrator creates/updates after checking physical serial
   and custody evidence. Office sees company register. Technician sees
   **only their selected, authorised Working Van**. Manager with neither
   Office nor Technician capability does not have visibility. No browser
   table write grants; server-side service-role calls check the session,
   role and company. A future Manager maintenance grant needs independent
   business approval.
7. **Stock isolation:** This register **never** changes VanStock product
   stock, refrigerant usage kg, warehouse commitments, purchase receipts
   or ServiceM8 billing. Physical movements will require separate approved
   stock movement reconciliation when such a link is introduced.

## Required evidence before first actual registration

- Physical serial/photo and whether it belongs to a supplier, business or
  customer.
- Exact gas label and nominal size (manufacturer/supplier record).
- Actual company receipt date, current physical location, and independent
  count against warehouse/van data.
- Supplier name from registered `suppliers` and any supplier agreement
  covering rent-free/return/forced-sale review dates.
- Cylinder inspection/test evidence, where applicable.
- Reason/document/docket reference recorded on each create/update.
- Supplier signed return docket *before* changing a cylinder to Returned.
- Discrepancies held as `unaccounted` and investigated; **do not** make a
  false supplier return or remove the record to hide a missing cylinder.

## Refrigerant records still needed independently

Refrigerant-content movements should be in **kg by refrigerant type**, with
documented purchase, sold, recovered and returned/disposed amounts, actual
licensed handler and required quarterly summaries. A cylinder may contain
residual refrigerant after dispensing; empty-cylinder custody return
must not be interpreted as an automatic kg usage/disposal posting.
A separate gas-content mass-balance and ARC reporting mapping must be
specified and accepted before claiming regulatory completeness.

Reference: current Commonwealth
`Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995`,
r.141 authorisation record conditions;
https://www.legislation.gov.au/F1996B02085/2026-07-01/2026-07-01/text/1/epub/OEBPS/document_1/document_1.html

Australian Refrigeration Council reporting guidance:
https://www.arctick.org/refrigerant-trading-authorisation/business-reporting-templates-and-guides/

## Deployment / regression gate

1. Run PGlite migration tests against an empty isolated synthetic database:
   unique serial, supplier-company FK, dates and location/status checks,
   role grants, RLS and immutable audit, returned status and stale version.
2. Run all existing VanStock tests and `npx tsc --noEmit`; verify preview
   build and no changed stock RPC function definitions.
3. Apply migration as an atomic **empty-table** production change only
   after regression validation and capture a prior snapshot of live stock,
   history and product counts. Verify no rows populated.
4. Merge one PR and confirm Vercel Production Ready. No existing stock
   quantities, supplier terms or user rights should change.
5. Complete signed-in iPhone/desktop form and roles acceptance in A06.
6. Physical cylinder reconciliation with supplier records, contract-specific
   hire dates, handling licences and an accountable register owner must be
   signed off before A10 is operationally closed.

## Rollback

Do not delete any cylinder events or supplier return records as a
"rollback". A newly empty register can be disabled in the UI without
touching stock. Once physical records exist, database rollback requires
an approved export/preservation and authorised recovery, not `drop table`.
