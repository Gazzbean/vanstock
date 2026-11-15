# VanStock – Authoritative Technical Audit & Controlled Pilot Gate (A01–A11)

**Version:** 15 November 2026 / A11; supersedes old **release instructions**, not
historical design decisions. Owner: Release Owner (to be assigned by Simplicity Air).
**Overall status: NOT AUTHORISED FOR OPERATIONAL CUTOVER.**

This is the single current release/acceptance register. Earlier guides retain
their original content for traceability but are marked historical. A passing
GitHub, TypeScript or Vercel result does **not** establish iPhone usability,
a separately isolated test environment, authorised stock opening balances,
customer billing reconciliation or actual cylinder custody.

## 1. Audited production baseline (15 November 2026, read only)

| Field | Evidence / status |
|---|---|
| Repository | `Gazzbean/vanstock` |
| Last verified production commit before A11 | `258ac45767dcc94dce0272e8483a1feb3feae2ff` (PR #58) |
| Latest merged release | PR #58 A10, Vercel Production success |
| Live Supabase project reference | `aqdwqargcjnhvupwtjcr` (do NOT use as a testing sandbox) |
| Recorded van stock | 15 rows, not a signed physical count |
| Recorded warehouse stock | 2 rows, not a signed physical count |
| Stock activity | 35 records |
| Warehouse requests | 11 records |
| Notifications | 29 records |
| Physical cylinder register | 0 records and 0 custody audit events |
| Operational data isolation | **NOT PROVEN**; Preview builds do not imply Preview-only Supabase |
| Warehouse write flag | Production setting scope exists; effective value/flags for target deployment **NOT PROVEN HERE** |
| Actual production domain/alias | **Needs Vercel deployment detail verification** |
| Dedicated acceptance/test URL, DB ref and deployment | **NOT DEFINED** |

The live row counts are a *baseline*, not a guarantee they will stay fixed;
capture new counts and the deployed SHA at the actual pilot cut-off.

## 2. Audit package disposition

| ID | Development delivery | Evidence | Remaining acceptance / accountable role | Final closure |
|---|---|---|---|---|
| A01 environment identity | Partially prepared | Vercel production deployment status only | Release owner: record Production URL/alias, Preview URL, deployment IDs, environment names, both Git SHAs, **different** DB refs, effective warehouse write flag by environment; show non-secret evidence | **OPEN – BLOCKER** |
| A02 per-user access scope | PR [#50](https://github.com/Gazzbean/vanstock/pull/50) merged; DB policy hardening | Isolated role tests; production policy checks | Admin/Technician/Office/Manager signed-in browser checks against correct candidate | Code complete, browser OPEN |
| A03 committed warehouse stock | PR [#51](https://github.com/Gazzbean/vanstock/pull/51) merged | Concurrency/isolation tests; committed stock check | Warehouse lead: actual issued/received physical-custody path; hold/shortage/discrepancy acceptance in isolated DB | Code complete, custody OPEN |
| A04 Manager independent duties | PR [#52](https://github.com/Gazzbean/vanstock/pull/52) merged | Manager permission regression | Business owner: approve duty matrix, separation of approval/issue/receipt and manager/technician roles per user | Code complete, user sign-off OPEN |
| A05 one Van → Warehouse route | PR [#53](https://github.com/Gazzbean/vanstock/pull/53) merged | Distinct source/destination; permission and route tests | A06 browser return acceptance, visual readiness and successful physical return | Code complete, browser OPEN |
| A06 UI state and duplicate action | PR [#54](https://github.com/Gazzbean/vanstock/pull/54) merged | Automated handler suite green | Office + Technician: B01–B12 signed-in **desktop and iPhone** from `docs/A06-consolidated-interaction-acceptance.md`; verify pending/error/green | Automated COMPLETE, browser **OPEN** |
| A07 long-lived queues | PR [#55](https://github.com/Gazzbean/vanstock/pull/55) merged | Aged queue/notification tests with 100+ records | Office + Technician: actual notification deep link and visible older history on isolated browser | Code complete, browser OPEN |
| A08 opening/physical counts | PR [#56](https://github.com/Gazzbean/vanstock/pull/56) procedure only; DEV-029 [#49](https://github.com/Gazzbean/vanstock/issues/49) not implemented | Read-only 35 product × location pairs, private A08 workbook | Warehouse lead + independent checker: actual warehouse/van count, UOM decision, test entries, signed variances, approved audited corrections | **OPEN – BLOCKER** |
| A09 ServiceM8 materials/billing | PR [#57](https://github.com/Gazzbean/vanstock/pull/57) merged; manual crosswalk procedure | 12 test-labelled issue events; zero live on-site allocations | Office invoice reviewer: at least one **real** job across issue, return/site, material UOM, ServiceM8 invoice approval | **OPEN – BILLING GATE** |
| A10 cylinder and refrigerant | PR [#58](https://github.com/Gazzbean/vanstock/pull/58) merged, empty custody ledger | Serial/custody/contract terms tests; 0 live cylinders | Warehouse lead: independent physical serials and supplier contracts; licensed refrigerant kg/ARC reporting scope to be agreed | **OPEN – CUSTODY/COMPLIANCE** |
| A11 maintenance/advisories | PR #59 candidate; security + docs + release control only | A11 grant-test run, index statistics, advisor disposition | Maintainer: review residual `SECURITY DEFINER` warnings individually, measure slow queries on real workloads, do not blindly remove indexes | Code package pending merge; monitoring OPEN |

**Do not mark the overall audit COMPLETE** merely because A02–A11 PRs are
merged. Each **OPEN** entry requires actual evidence and accountable sign-off.

## 3. A11 findings & dispositions

### Permission/security review (Supabase advisers)

- **WARN: 2 anonymous-executable trigger-only SECURITY DEFINER functions.**
  `vanstock_block_disputed_receipt()` and
  `vanstock_enforce_manager_request_transition()` are invoked as
  `warehouse_replenishment_requests` triggers, not user-callable
  warehouse workflows. A11 revokes their public/anon/authenticated
  EXECUTE grants while retaining service-role execution; regression
  checks that Manager transitions and disputed receipt rejection still work.
- **WARN: 40 authenticated-executable SECURITY DEFINER RPCs.** These require
  per-function inspection of security predicates and original callers.
  Some are intentional authenticated operations. A11 does **not**
  revoke all of them or convert them to SECURITY INVOKER; that
  could stop stock transactions and change authorization semantics.
  Record findings separately before proposing grants changes.
- **INFO: 17 RLS-enabled tables without policies.** These include
  service-role-only audit/ledger tables with explicit direct browser
  privileges revoked. Advisor severity alone does not make the tables
  public or accessible. Verify each table's grants in a security review;
  no permissive policy is added to silence an INFO item.
- **WARN: Supabase compromised-password protection.** Configuration
  decision remains open with the account administrator. Do not flip
  Auth settings during this development release without approval.
- No auth/warehouse write flags, existing application roles, live stock
  or ServiceM8 jobs are changed in A11.

### Database performance review

- Warehouse requests already have `warehouse_requests_company_status_created`,
  and `EXPLAIN (FORMAT JSON)` for the current open-request company/status
  query shows PostgreSQL using that index.
- Notifications already have `warehouse_notifications_inbox` and
  a partial `warehouse_notifications_visible_idx` for nondismissed alerts.
- Job material allocations have a company/status/date index; cylinder
  custody/status, supplier and audit history have indexes.
- INFO adviser reports **76 unindexed foreign keys** and **8 unused
  indexes**. This is a candidate list, **not** evidence of an actual
  latency regression. No speculative global indexing, dropping unused
  indexes or unnecessary `ANALYZE`/rewrites are made on live production.
- Before adding an index, collect the slow query and parameter shape,
  real table cardinality, a before/after EXPLAIN on a suitable isolated
  dataset, storage/write overhead and rollback plan. Prioritise
  high-row-count query paths only when measured.

### Repository maintainability review

- Historical October/early-November warehouse, permissions, rollout
  and staging guides are clearly labelled **historical**; their old
  release claims are preserved in place with a current link.
- No duplicate backup source snapshots (`.old`, `.bak`, `_copy`)
  were identified in the current Git tree. No files are deleted
  blindly; the legacy helper security migration and tests are valid
  audit history, not duplicate working code.
- `lib/actions.ts` remains a large, coupled server-action module.
  **Do not** redesign or split it during operational pilot preparation.
  Later refactoring should occur per bounded domain with full
  behavioural, privilege and atomicity tests.
- Keep exact per-product units, A03 reservations, Manager's independent
  privileges, current Work Van auth, and notification history as stable
  interfaces. Avoid broad rewrite or new platform.

## 4. Environment / operational cutover evidence to capture

| Item | Production | Isolated acceptance |
|---|---|---|
| Stable URL / configured alias | **To verify** | **To establish** |
| Deployment ID and commit SHA | SHA captured; actual deployment ID **to verify** | **To establish** |
| Vercel environment and branch | Production/main | Preview/test branch only |
| Supabase project ref | `aqdwqargcjnhvupwtjcr` | **Must differ** from Production |
| Non-secret warehouse write flag status | **Verify effective state** | Disabled until controls accepted |
| Stock/notification/cylinder baseline | Read-only counts above | Synthetic isolated fixtures only |
| Sign-off and date | Release owner **TBD** | Office, Manager, Technician + release owner **TBD** |

Never copy Supabase connection strings, service-role keys, user passwords
or API tokens into screenshots or docs. A green Vercel status does **not**
prove the database used by a browser session.

## 5. One-van controlled pilot: go/no-go

**Prerequisites – all must be signed off before a real inventory pilot:**
1. A01 evidence shows unique environments, correct deployed code and an
   isolated test DB; stock writes are enabled only in the approved target.
2. Business owner signs A04 approval/dispatch/receipt separation and role
   assignments. Reuse A06's B01–B12 for one combined desktop/iPhone
   browser pass and save only exception screenshots.
3. A08 physical inventory of the selected van and issuing warehouse is
   counted, independently checked, with deliberate zero-versus-unrecorded
   treatment and TEST-labelled opening data resolved. Signed variances
   are posted by the correct role, once, with audit references.
4. Simulate warehouse request→approval→committed issue→receipt in
   **isolated** data, including one competing one-unit issue, failed
   transaction, damaged/short receipt, retry and history verification.
5. A09 Office reviewer reconciles one genuine job from VanStock
   material issue through ServiceM8 invoice/approval; job references
   and pack/each/kg units must match. Client-side double-click guards
   do not establish server idempotency across independent retries.
6. A10 actual supplier cylinder count/ownership/serials is reconciled.
   Resolve supplier rental agreements and refrigerant kg/ARC reporting
   scope before representing the system as compliant for that use.
7. Operations accepts a documented pilot reversal/incident procedure,
   daily reconciliation owner and exception escalation path.
8. Final release owner records test results, sign-off timestamps,
   current SHA and production URL, and explicitly authorises go-live.

**Pilot guardrails:** select **one van + one warehouse** and named staff
only. Monitor all issues, returns, warehouse commitments, expenses,
cylinders and job billing daily; stop on a missing audit trail, duplicated
movement, unexplained negative/committed balance or unexpected permissions.
Do not bypass a failed permission check with direct SQL or use a database
backup restore as a routine adjustment. Post a compensating, authorised
audited correction only after investigation.

**No-go conditions:** production and test share a database, missing signed
physical quantities, any unresolved unauthorised access, an unapproved
material/billing exception, an open physical custody discrepancy with no
owner, failed A06 browser tests or inability to reproduce the deployed
candidate/environment.

## 6. Current next actions and decision ownership

- **Release owner / maintainer:** A01 environment identity evidence and
  Vercel deployment alias, plus A11 production grant check and residual
  SECURITY DEFINER review.
- **Admin/business owner:** Approve A04 duty matrix and iPhone+desktop
  A06 role acceptance.
- **Warehouse lead and physical checker:** A08 count and signed variances,
  then A10 serial and supplier-hire-document register.
- **Office invoicing reviewer:** A09 first genuine ServiceM8 job material
  reconciliation before invoice sign-off.
- **Joint go/no-go:** Approve a one-van pilot only once evidence is complete.

### Read-only technical preflight
Use `supabase/checks/a11_release_preflight_readonly.sql` in the
**known live environment**. Never run its output as a migration. Refresh
current counts before a pilot; never treat these older counts as ongoing
facts. Compare current application deployment and DB project reference
manually with Vercel/Supabase before any data write.
