-- READ-ONLY checks. Run in Supabase SQL Editor for the VanStock project.
-- Do not share user emails, access tokens or secret keys in chat.
-- 1. Verify profile roles and assigned vans:
select p.id, p.full_name, p.role, p.company_id, p.van_id, v.van_number
from public.profiles p left join public.vans v on v.id = p.van_id
order by p.full_name;
-- 2. Review row-level security policies on profiles:
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;
-- 3. Review direct client UPDATE permission on profiles:
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='profiles'
  and privilege_type='UPDATE'
order by grantee;
