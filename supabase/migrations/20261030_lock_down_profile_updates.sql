-- VanStock security hardening: remove client-side profile updates.
-- Reviewed in response to pg_policies and role_table_grants checks on 30 Oct 2026.
-- IMPORTANT: Review and take a DB backup before execution.
-- Existing sign-in and authenticated profile SELECT policies are retained.
BEGIN;
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;
DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
COMMIT;

-- After running, verify there is no direct client UPDATE privilege
-- and no "profiles update own" policy.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND privilege_type = 'UPDATE'
ORDER BY grantee;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;
