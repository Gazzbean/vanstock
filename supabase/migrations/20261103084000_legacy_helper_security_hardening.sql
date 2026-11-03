-- Security-linter hardening for legacy helper functions already in production.
-- No inventory, account, or transaction rows are modified.
-- These functions are used by authenticated RLS policies and triggers, not anonymous clients.

ALTER FUNCTION public.my_company_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.my_van_id() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.my_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_van_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_van_id() TO authenticated;

-- Trigger execution does not require browser users to call its trigger function.
REVOKE EXECUTE ON FUNCTION public.vanstock_block_inactive_writes() FROM PUBLIC, anon, authenticated;
