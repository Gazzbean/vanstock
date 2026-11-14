# A03 – Warehouse stock commitments / issue safety

Baseline: production `2237116`, 14 Nov 2026.
Approved scope: preserve existing two confirmations and prevent competing dispatches.

## Stock meaning
- **Recorded warehouse quantity**: total ledger quantity until receiving confirms.
- **Committed quantity**: issued warehouse requests not yet confirmed received.
- **Available quantity**: warehouse quantity minus committed quantity, clamped by the database CHECK constraint.
- **Issued**: goods physically dispatched, no double-issue permitted.
- **Received**: all issued goods verified; warehouse quantity and committed quantity decrease together, van stock increases, one audit event.
- Short/damaged delivery: report and hold; warehouse reviews and physically reconciles the entire issued quantity before resolving and completing full receipt. **No shortfall is automatically returned to available or silently written off.**
- Partial receipt or write-off of permanently missing goods is intentionally **out of scope** until a separate approved physical-custody and loss-accounting procedure exists. Existing discrepancy records remain visible and block final receipt.

## Invariants and controls
1. `0 <= committed_quantity <= quantity` on every warehouse stock row.
2. Only the approved → issued RPC reserves, using one conditional row-locked UPDATE. Two requests cannot reserve the same last unit.
3. Only the issued → fulfilled RPC releases its reservation, debits warehouse and credits receiving van transactionally, with no duplicate receipt.
4. All other warehouse stock decreases (correction, count, legacy movement) are blocked if they would take quantity below committed stock.
5. Existing Manager permission trigger, receiving authorisation, discrepancy blocker, notifications and transaction audit are retained.

## Controlled deployment
1. Verify live status counts and zero inconsistent issued requests. A03 migrates with explicit backfill for existing issued rows.
2. Run isolated PostgreSQL tests: two competing issues for one unit; insufficient availability rollback; normal receipt; duplicate retry; discrepancy hold and reconciliation; correction blocked under reservation; app availability display.
3. Apply migration atomically to production *before* publishing application queries requiring the new field. Recheck old/new row counts, integrity and permissions.
4. Merge one PR and confirm Vercel production deployment, then run read-only live smoke checks.
5. Rollback after the column is used must NOT drop the field blindly. Preserve commitments, hold dispatches and follow a signed recovery plan. No stock correction by guessing.

A03 does not alter A01 warehouse release flag, A04 authority separation, or A05 duplicate returns screens.
