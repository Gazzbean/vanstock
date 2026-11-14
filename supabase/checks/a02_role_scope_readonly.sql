-- A02 post-migration read-only verification (run only AFTER rollout).
-- Privilege checks return TRUE only when lockdown is present.
select
 not has_table_privilege('anon','public.vans','SELECT') as anon_no_van_read,
 not has_table_privilege('authenticated','public.vans','INSERT') as users_no_van_insert,
 not has_table_privilege('authenticated','public.vans','UPDATE') as users_no_van_update,
 not has_table_privilege('authenticated','public.vans','DELETE') as users_no_van_delete,
 not has_table_privilege('authenticated','public.vans','TRUNCATE') as users_no_van_truncate,
 not has_table_privilege('authenticated','public.products','INSERT') as users_no_product_insert,
 not has_table_privilege('authenticated','public.products','UPDATE') as users_no_product_update,
 not has_table_privilege('authenticated','public.stock','UPDATE') as users_no_direct_stock_update,
 has_table_privilege('authenticated','public.stock','SELECT') as users_can_read_rls_stock,
 has_table_privilege('service_role','public.stock','UPDATE') as service_stock_mutations_preserved,
 has_table_privilege('service_role','public.vans','UPDATE') as service_vehicle_mutations_preserved;

-- Run in a new read-only transaction against an EXISTING manager with:
-- role=manager, technician_access=true, office_access=false, assigned vans.
-- No production data modifications or seeded test transactions are necessary.
begin transaction read only;
select set_config('request.jwt.claim.sub',(
  select p.id::text from public.profiles p
  join public.user_access_capabilities c on c.user_id=p.id
  where p.role='manager' and p.is_active=true
    and c.technician_access and not c.office_access limit 1
),true);
set local role authenticated;
select
  (select count(*) from public.vans) as visible_vans,
  (select count(*) from public.vans v where v.id in (select van_id from public.user_authorized_vans)) as authorised_vans,
  (select count(*) from public.vans)=
  (select count(*) from public.vans v where v.id in (select van_id from public.user_authorized_vans)) as vans_scope_pass,
  (select count(*) from public.stock) as visible_stock,
  (select count(*) from public.stock s
    where s.van_id in (select van_id from public.user_authorized_vans)) as authorised_stock,
  (select count(*) from public.activity_log) as visible_history,
  (select count(*) from public.activity_log l
    where l.van_id in (select van_id from public.user_authorized_vans)) as authorised_history,
  -- Must be TRUE for both comparisons:
  (select count(*) from public.stock)=
  (select count(*) from public.stock s
    where s.van_id in (select van_id from public.user_authorized_vans)) as stock_scope_pass,
  (select count(*) from public.activity_log)=
  (select count(*) from public.activity_log l
    where l.van_id in (select van_id from public.user_authorized_vans)) as history_scope_pass;
rollback;

-- Also run isolated fixtures for Admin, Office-only, Technician without Office,
-- unassigned van, inactive account and no-session access before release.
