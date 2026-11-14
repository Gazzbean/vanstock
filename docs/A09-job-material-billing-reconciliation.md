# A09 — ServiceM8 job materials and billing reconciliation

**Status:** DEVELOPMENT CONTROL PREPARED; **ACTUAL CUSTOMER-JOB RECONCILIATION OPEN**.
**Evidence date:** 14 November 2026, Australia/Perth.
**System of record split:** VanStock records stock custody, job issue, returns
and site allocation. **ServiceM8** is the source for customer job billing and
invoice approval. There is **no automatic job-material billing interface**.

## Read-only baseline

- VanStock live `activity_log` contains **12** `issue` records under
  **five test-labelled job references**. All are marked test evidence;
  none may be treated as a genuine billable customer job.
- Nine issue records have explicit "Materials used on job" notes. The other
  three are issue/estimated-use test records. All 12 have reference strings.
- Live `job_material_allocations`: **0 rows**, therefore no observed
  unresolved allocation; this does not prove an operational invoicing workflow.
- Product catalogue has 7 active products; no verified ServiceM8 item-code
  crosswalk is available. The product named `TEST – Cable Ties 500pk` is
  stored as `ea`; confirm whether 1 VanStock unit is one tie or one pack.
- No ServiceM8 job-card or invoicing data was connected or directly checked.
  Do not claim actual reconciliation, billing completion or financial accuracy.

## Accepted first-release operating method

1. **Technician** selects their authorised Working Van. On the Materials Used
   screen enter the **exact** ServiceM8 job number, each product and correct
   stock-unit quantity. Distinguish `Materials Used on Job` from `Leave
   Materials on Site`; latter requires physical site location and reason.
2. VanStock `record_job_materials` records all submitted material lines
   atomically and deducts van stock. **It does not add invoice lines to
   ServiceM8**. The confirmation must clearly say this.
3. Where material was **allocated on site**, the allocation remains
   `on_site` until explicitly marked `used` or `returned`.
   - Marking **used** does *not* deduct van stock a second time.
   - Returning unused allocation **restores van stock once** and requires
     a ServiceM8 billing correction if the material was previously listed.
   - Never automatically bill an unresolved site allocation as consumed.
4. **Office** compares the VanStock issue event ID, job reference, product,
   stored unit and net quantity used with the corresponding ServiceM8
   job card's **Billing / Quotes & Invoicing** items.
5. Confirm material codes and units using the Product Crosswalk sheet.
   Apply an explicitly documented conversion factor for packs where needed;
   **never** assume that `ea` in VanStock and a pack on the invoice are
   equivalent.
6. **Office reviewer** records one of: billable and matched, missing billing,
   quantity variance, missing/incorrect job, duplicate event, return requiring
   credit/correction, agreed non-billable, site allocation still unresolved,
   or excluded test reference. Escalate unresolved exceptions to the
   authorised invoice approver.
7. Update ServiceM8 billing **only in ServiceM8**, through its normal job
   workflow. Do not enter fictitious VanStock supplier receipts, stock issues,
   transfers or adjustments to reconcile invoicing figures.
8. Use the ServiceM8 **Invoicing → Awaiting Approval** stage as the stop gate:
   no approval until material quantities and any authorised non-billable
   exceptions have been independently checked and documented.
9. Record Office reviewer, review date, job number, invoice number/status and
   evidence reference. The completed manual register is an offline controlled
   artifact and **must not be copied into a public source repository**.

## Exceptions to track before invoice approval

| Exception | Resolution |
|---|---|
| VanStock issue has no actual ServiceM8 job | Confirm exact job ID, correct reference if possible via controlled audit trail, do not blindly create invoice |
| VanStock material has no ServiceM8 line | Add/reconcile material on correct job, or document approved non-billable treatment |
| ServiceM8 line has no corresponding VanStock issue | Verify sourcing, existing customer material or previous job allocation; investigate stock posting separately |
| Quantity mismatch | Verify original issues, physically returned quantities, unit conversion and credited invoice line |
| Rapid/double issue or uncertain network response | Inspect VanStock Transaction History by job/ref and product before **any** retry; do not blindly post again |
| Allocation remains `on_site` | Hold consumption classification, confirm physical custody and resolve used or returned |
| Return entered after billing | Amend or credit the ServiceM8 material line according to billing procedure |
| Test reference | Exclude from real customer billing, retain audit history |
| Non-billable/warranty material | Record approval, reason, correct project/job cost treatment |

## App safeguards in the A09 package

- Materials Used no longer preselects the first product. Technician must
  choose it explicitly.
- Form shows an **amber review** of job, Working Van, item quantities and
  exact UOM before committing the VanStock stock deduction.
- A synchronous client-side submission guard prevents rapid repeated clicks;
  on success the form is locked and turns **green**, until the user changes
  an input. Server errors turn **red**. Unexpected failures instruct users
  to check history before retrying.
- Separate guards cover marking an on-site allocation used or returned.
  Backend status checks remain the authority; resolving an already-closed
  allocation cannot happen twice.
- Load **all** unresolved on-site allocations using deterministic pages,
  under the authenticated company and Working Van scope, instead of only
  the most recent 100.
- **Limitation:** Server `record_job_materials` does not yet accept a unique
  idempotency key. The client guard reduces duplicate clicks but does not
  guarantee exactly-once delivery across network retries or a new session.
  The manual office duplicate-event check and controlled-error review remain
  mandatory before invoice approval. Future automatic integration must
  implement an idempotent event/billing mapping.

## Pilot evidence required before A09 operational sign-off

- One **genuine** ServiceM8 job with at least one VanStock material issue.
- Verify exact job number and item/UOM crosswalk.
- Compare issued, on-site, returned, net used and ServiceM8 billed quantities.
- Include one non-billable or return case if present (do not fabricate one).
- Document and resolve any exception, independent reviewer, invoice stage and
  accepted treatment. Confirm VanStock quantities and Transaction History
  remain correct.
- Do not call A09 operationally complete until this actual job is reconciled.
- A08 physical counts, A01 environment isolation and A06 authenticated UI
  acceptance remain separate release prerequisites.

## References

- ServiceM8: Add material to job online —
  https://support.servicem8.com/help-center/desktop/basics/how-to-add-materials-to-a-job-online
- ServiceM8: Complete and invoice a job; Awaiting Approval review —
  https://support.servicem8.com/help-center/desktop/basics/how-to-complete-and-invoice-a-job
- ServiceM8: Job Material API records are separately keyed to a job —
  https://developer.servicem8.com/reference/getjobmaterials
- VanStock: `supabase/migrations/20261103130000_job_material_allocations.sql`.
- Private workbook: `VanStock_A09_ServiceM8_Job_Materials_Reconciliation.xlsx`
  (external controlled user artifact, not included in GitHub).
