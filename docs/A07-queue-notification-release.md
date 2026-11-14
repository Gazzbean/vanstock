# A07 — Warehouse Request Visibility and Notification History

Audit baseline: 14 November 2026. Implementation uses existing Supabase
tables, status indexes and server-scoped queries. No schema migration.

## Rules
1. Load **every open request** (`pending`, `approved`, `issued`)
   in deterministic 400-row pages, without a final 100-row slice.
   Permission filters apply in every page: Manager/Admin scope, requester
   or authorised incoming van as existing rules permit.
2. Only recent closed request history is capped (100).
   A specifically linked, older closed record can be added back after
   an explicit company, role and notification-recipient authorisation check.
3. Links from notifications and My Actions use
   `?request=<UUID>#warehouse-request-<UUID>`.
   The warehouse/van page passes the requested ID to the server; the client
   switches from Open to All when needed, highlights and scrolls to the
   correct responsive row (desktop or mobile).
4. A target missing or unauthorised does not reveal existence or data:
   the UI reports only "not available in authorised warehouse records."
5. Active notifications are paginated separately from most recent dismissed
   history (100). Read, dismissal and clear-read RPCs are unchanged.
   History rows are retained in the database; UI can show more entries,
   while the history window remains intentionally bounded.
6. My Actions uses the A04 independent approve/issue/van-receipt rights.
   No unrelated warehouse stock, request-status or permission mutation.

## Test and release
- Isolated in-memory database/service tests populate more than 400 requests,
  including older open work, completed history, company-isolated requests and
  an old notification-linked record.
- In-memory notification tests include more than 100 recent dismissed entries
  newer than a still-active notice; active notice must remain visible.
- Component/route tests verify the completed-request filter and scoped links.
- Full npm suite and Vercel build must pass before merging.
- Read-only live check: before/after request status counts, notification counts,
  database role permissions and warehouse stock rows unchanged.
- Final authenticated desktop/iPhone deep-link acceptance belongs to A06
  consolidated acceptance, and is not implied by automated success.
- Production operational release hold remains until A01 environment isolation,
  A06 signed-in acceptance and A08 physical reconciliation are addressed.
