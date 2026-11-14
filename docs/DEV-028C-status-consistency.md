# DEV-028C — Consolidated VanStock status/confirmation review

Review date: 2026-11-14. Baseline: main @ d002bb4.

## Standard

| Situation | Indicator | Meaning |
| --- | --- | --- |
| No complete action details | Neutral grey | Input in progress |
| All required fields / explicit review / decision pending | Amber/orange | **Not yet saved or stock moved** |
| Action completed successfully | Green | Explicitly label whether only a request was submitted or stock actually moved |
| Blocking validation or unsuccessful action | Red | Error; do not claim any stock movement |
| Permission or stock-availability warning | Amber | Why action is unavailable / next safe step |
| Informational explanation | Blue | Nonblocking guidance |
| Selected mode/default van | Green as existing | Selection only; not transaction confirmation |

## Findings and changes

1. **Receive Stock**: receipt details were green before saving; changed to amber and clarified "not saved". Final confirmation review remains amber; successful receipt stays green. Existing duplicate-receipt red alert retained.
2. **Van Transfers**: transfer details and pending decision looked successful before submission/receipt. Changed to amber. Completed transfer and request-submitted messages retain explicit stage wording. Green selected-package indicator remains selection only.
3. **Warehouse Replenishment**: DEV-027 orange/green confirmation retained. Queue messages clarify whether approval, physical issue or receipt occurred; request errors and successes use a shared notice.
4. **Warehouse movements, stock corrections, opening stock, receipt exceptions**: existing authorisation gates and calculations untouched; errors, completions and stock-availability warnings now use the shared notice.
5. **Materials Used / consumables**: usage errors and successful recording use consistent notices; no ServiceM8 billing behaviour changed.
6. **Supplier receiving**: pack/loose receipt results use the shared notice; serialised-cylinder receiving limitation is highlighted as a warning.
7. **Administration**: Manager and warehouse permissions, staff capabilities, users, van assignments, vehicle register, catalogue and consumable assignments, supplier packages and bin locations distinguish real errors from saved confirmations.
8. **Navigation and inbox**: notification history, unread and dismissal actions already serve different purposes from transactional confirmations and remain unchanged. Fleet stock levels and default/alternate van colours remain distinct.

## Deliberate exclusions

- No changes to database schema, Supabase RPCs, RLS, user permissions, warehouse write-release flag, stock calculations, or transaction authorisation.
- No new submit/approve operations and no automatic transaction replay.
- Existing two-stage confirmations, quantity conversion, stocktake process and audit references are preserved.
- Any future redesign of receipt/usage button staging requires independent testing and is not silently introduced here.

## Acceptance / release checks

- [ ] Preview build succeeds (TypeScript/Next.js).
- [ ] Receive Stock: selected mode green; details ready amber; final review amber; saved success green; duplicate stays red.
- [ ] Van Transfers: details/review amber, pending receiving confirmation amber, processed success green with stage-specific wording.
- [ ] Warehouse: unavailable movements remain hidden with warning; replenishment request orange then green; queue stage-specific messages.
- [ ] Materials Used: error red, usage recorded green, no unintended stock changes from rendering.
- [ ] Administration: API errors use red notices; successful saves use green notices; capability changes enforce existing access rights.
- [ ] Mobile: shared notices and queue actions wrap correctly.
- [ ] Following merge, perform one production smoke check on the stable main domain.

This is one consolidated UI-only release. Avoid per-file deployments or asking for individual screenshots for every message.
