-- Final permission lockdown for stock writes: STAGING ONLY.
-- Apply AFTER the transactional van action and warehouse transfer RPCs
-- have been tested with authenticated user sessions.
-- This does not remove company-scoped stock SELECT permissions.
begin;
revoke insert, update, delete on table public.stock from anon, authenticated;
revoke insert, update, delete on table public.activity_log from anon, authenticated;
revoke insert, update, delete on table public.warehouse_stock from anon, authenticated;
-- Product creation by managers remains a service-role server action pending
-- separate product mutation security review.
commit;

-- Verify with information_schema.role_table_grants and a technician
-- API attempt; no direct stock/log mutation should be possible.
-- Service role is retained for existing manager product actions and reads.
