# A06 — Consolidated VanStock interaction acceptance

**Status:** AUTOMATED ACCEPTANCE IN DEVELOPMENT. Browser and physical-stock acceptance are **NOT signed off**.

**Basis:** VanStock Comprehensive Technical Audit A06 (14 November 2026).
**Scope:** A02–A05 UI interactions, status borders, role-sensitive navigation,
replenishment and returns. No redesign of stock ledger, A03 issue commitments or
A04 Manager grants. Do not use live inventory for synthetic financial/stock transactions.

## Automated acceptance (GitHub Actions)
- Test actual rendered component controls and invoke input and button handlers
  with a local React-hook harness and mocked server actions; never call live RPCs.
- Check that required selections and reasons block submission until valid.
- Verify orange/amber pre-save border and explicit action review; amber pending
  when a request is in flight; red on a failed operation; green after confirmed success.
- Verify disabled warehouse return/adjustment renders warning, not active inputs.
- Verify fast repeated clicks dispatch a **single** RPC call for request,
  warehouse return, correction, opening count, approval and van receipt.
- Verify a reported error can be corrected and retried once, with visible feedback.
- Re-run **all** repository tests; fail the release on any regression.
- Vercel preview and production code builds must succeed.
- Retain A02 access, A03 one-unit competition, A04 separation and A05 route
  tests as part of the full suite.

## Single authenticated browser acceptance session — still required
**Preconditions**
1. Confirm one stable Vercel production URL, commit SHA and effective
   `WAREHOUSE_WRITES_ENABLED` release flag before testing.
2. Confirm the browser environment and its Supabase DB are isolated from
   operational inventory **before** writing test transactions. A preview
   deployment is NOT proof of database isolation.
3. Keep actual staff passwords, tokens, API keys and secrets out of screenshots.
4. If isolated test inventory is unavailable, perform *read-only* and *pre-submit*
   visual checks only; do not issue, return, post counts or adjust live stock.

| ID | Role / viewport | Steps | Expected | Status |
|----|-----------------|-------|----------|--------|
| B01 | Admin / desktop | Admin → Manager permissions | Eight distinct grants, two A04 additions individually off unless enabled | Pending |
| B02 | Manager / desktop | Warehouse → return entry | One Van → Warehouse path, no second return form inside corrections | Pending |
| B03 | Manager / desktop | Return form: choose van, destination, product, qty, reason | Source/destination both blank initially; ready review lists both; orange border | Pending |
| B04 | Technician / iPhone | Switch authorised Working Van, open return | Only selected, authorised van available; different company's van absent | Pending |
| B05 | Office-only / desktop | Visit return direct URL | No return grant, no write controls; cannot bypass using URL | Pending |
| B06 | Technician / iPhone | My Van Stock | Van inventory quantities view-only; request queue, request and return links remain available under grants | Pending |
| B07 | Manager / desktop | Warehouse replenish: pick product, quantity, receiving van, reason | No first-company-van auto-selection; amber ready review; shortage explained | Pending |
| B08 | Appropriate actor / both | Refresh request queue and follow notification deep link | Correct request visible and stage labels accurate | Pending; A07 queue pagination separately outstanding |
| B09 | All appropriate actors / both | Inspect disabled warehouse controls | Warning and no active return/adjustment controls while flag off | Pending |
| B10 | Isolated test DB only | Request → approval → issue → van confirmation | Statuses progress once; committed stock blocks double issue; ledger changes only on confirmed receipt | Pending |
| B11 | Isolated test DB only | Report and resolve short/damaged delivery | Full commitment remains held until physical reconciliation and final receipt | Pending |
| B12 | Isolated test DB only | Double-click submit, deliberate server error, retry | At most one write per user action, red error then orange ready and green completion; history single event | Pending |

## Result handling
- For each failed scenario record: user role, phone/desktop, exact URL, commit
  SHA, expected/observed behaviour, and one relevant screenshot **only if needed**.
- If a user cannot see a workflow because they lack its grant, that is a
  permission result, not an interface defect.
- No more repetitive screenshot collection for already-verified automated
  cases. Group unresolved browser issues into one follow-up PR.
- Existing A01 uncertainty about test/production DB isolation **blocks**
  live write-acceptance tests until resolved.
- A06 cannot close its entire release gate based solely on GitHub/preview
  success. An authorised user must approve the signed-in desktop and iPhone
  results before the VanStock operational pilot.
- A08 physical counts and A09 job-material reconciliation are separate
  prerequisites for operational cutover.
