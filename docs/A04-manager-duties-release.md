# A04 – Manager permissions and separation of duties

Scope: separate warehouse request approval, physical issue, van receipt,
warehouse return acceptance, stock adjustments and physical stocktakes.

## Role/permission matrix
| Operation | Administrator | Manager | Technician / Apprentice | Office-only |
|---|---|---|---|---|
| Request replenishment | Yes | Yes | Warehouse request grant & authorised van | Explicit request grant |
| Approve/reject request | Yes | `approve_requests` | No | No |
| Physically issue request | Yes | `issue_warehouse` | No | No |
| Confirm van receiving of issued goods | Yes | `confirm_van_receipt` | Their authorised van | No (unless separately Technician-authorised) |
| Report receiving shortage/damage | Yes | Confirm-van-receipt grant, or authorised van | Their authorised van | No (unless explicitly authorised van) |
| Accept Van→Warehouse return | Yes | `receive_returns` | Existing warehouse receive grant, assigned van | No |
| Add/remove stock correction | Yes | `adjust_stock` | No | No |
| Set verified count / opening count | Yes | `stocktake_warehouse` | No | No |

## Distinct grants; no blanket four-eyes assumption
The Admin can grant multiple duties to the same Manager. Neither the original
audit nor current business instruction mandates that the requester, approver,
issuer and receiver be four different people. Every transition remains audited
to an actor, and all four responsibilities have separately enforceable checks.
A four-eyes policy can be added later only with explicit business approval.

## Migration behavior
- Existing `approve_requests`, `issue_warehouse`, `receive_returns`,
  `adjust_stock`, catalogue and vehicle grants remain unchanged.
- New Manager `confirm_van_receipt` and `stocktake_warehouse` grants
  default **false**; do not silently inherit the old mixed rights.
- Admin or Manager+Technician may have van assignments, but Manager-role
  final receipt still requires explicit `confirm_van_receipt` grant.
- Technicians may receive into authorised vans, not arbitrary company vans.
- Warehouse Manager new flags are Admin-controlled and recorded in the
  existing `manager_permission_audit` with previous/new values.
- Database gate, request transition trigger, direct receipt RPC,
  discrepancy RPC and opening/adjustment RPC all align to the matrix.

## Deployment and verification
1. Confirm no pending issue/receipts require a Manager-only receiver during release.
2. Run isolated PostgreSQL tests across each grant and denial path. Execute
   complete `npm test` suite and Next.js build on candidate branch.
3. Apply migration atomically to live Supabase **before** code referring to new
   columns and new RPC signature is published.
4. Inspect live Manager grants and database RPC execute grants; no stock
   movement is required for a read-only smoke test.
5. Deploy candidate commit and inspect Vercel status.
6. Preserve new-grant false defaults unless Admin explicitly enables them.
7. A05 duplicate movement panels, A06 visual acceptance, A08 physical count
   remain independent audit issues.

## Recovery
Migration changes function signatures and permissions; do not drop
the new columns before app rollback. Hold changes and restore a reviewed
prior function/grant snapshot if an operational regression is confirmed.
