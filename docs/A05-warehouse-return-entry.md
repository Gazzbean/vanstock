# A05 – One controlled Van → Warehouse return
Owner: Warehouse workflow and release maintainers.
Business basis: Comprehensive Technical Audit A05, 14 November 2026.

## Operational decision
- **One return route:** `/warehouse/returns`, accessible to an Administrator,
  a Manager with `receive_returns`, or a Technician with explicit `can_receive`.
- **One return form**, reused regardless of the user's source screen.
  The Warehouse dashboard and My Van Stock link to the route but contain no
  independent return entry fields. Warehouse adjustments contain no return mode.
- **Both ends explicitly selected:** source van and receiving warehouse begin
  unselected, even when only one option is present. Ready state includes an
  explicit van → warehouse review, quantity, product and reference.
- **Technician:** eligible source is their currently selected authorised Working
  Van only. The database independently validates membership in
  `user_authorized_vans`, Technician capability and warehouse receive grant.
  Switching authorised vans via Working Van selection remains audited.
- **Manager/Administrator:** may choose any *active company* van, provided their
  existing independently configured receive authority permits the return.
- **Office-only:** no implicit return permission. A Technician base role with
  Office-only capability cannot bypass the warehouse movement database gate.
- **Replenishment:** separate two-confirmation request, approval, issue and
  receiving workflow unchanged. My Van Stock retains request/receipt controls
  but its listed inventory quantities remain view-only.
- **Adjustment and stocktake:** unchanged authority and ledger logic, but their
  UI no longer offers returns. Disabled corrections show the warning instead
  of input fields.
- **Warehouse request destination:** when initiated by Office/Manager, no
  implicit first company van. Selecting a receiving van is mandatory.
- **Release flag:** `WAREHOUSE_WRITES_ENABLED` unchanged. Disabled return
  shows no inputs; server action checks the flag independently.

## Validation and release
- One consolidated PR, GitHub full suite and Vercel candidate build.
- Isolated Postgres-compatible tests of active/inactive authorised vans,
  alternate-van selection, unassigned van, Manager/Office/Technician gates,
  and direct RPC calls.
- UI source tests cover one route, no duplicate form mounts,
  no default company van, disabled-gate rendering, and submit re-entry guard.
- Apply the single RPC migration first (atomic, no DML to stock), then merge
  accepted code. Existing A04 permissions and A03 commitments preserved.
- Confirm current production request/stock counts before and after.
- Authenticated iPhone/desktop usability acceptance deferred to consolidated
  A06, not substituted by a successful Vercel build.

## Rollback
This migration modifies only one `SECURITY DEFINER` function. Preserve
original `pg_get_functiondef` before applying and restore it atomically
if a verified regression occurs; do not broadly relax grants. A frontend
rollback must match the restored default/authorised-van behaviour.
