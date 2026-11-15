-- A11: revoke unnecessary web-exposed EXECUTE grants from two trigger-only
-- SECURITY DEFINER routines. No trigger or stock-logic changes.
-- Trigger activation is controlled by PostgreSQL triggers, not REST calls.
begin;
revoke all on function public.vanstock_block_disputed_receipt() from public,anon,authenticated;
revoke all on function public.vanstock_enforce_manager_request_transition() from public,anon,authenticated;
grant execute on function public.vanstock_block_disputed_receipt() to service_role;
grant execute on function public.vanstock_enforce_manager_request_transition() to service_role;
commit;
