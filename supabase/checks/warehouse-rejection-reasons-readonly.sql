-- DEV-028B post-migration read-only verification.
-- Expected: all boolean checks TRUE. Legacy rejected rows may lack reasons.
select
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='warehouse_replenishment_requests'
      and column_name='rejection_reason'
  ) as reason_column_exists,
  to_regprocedure('public.reject_warehouse_replenishment_request(uuid,text)') is not null
    as rejection_rpc_exists,
  exists (
    select 1 from pg_trigger
    where tgrelid='public.warehouse_replenishment_requests'::regclass
      and tgname='warehouse_replenishment_rejection_reason_guard'
      and not tgisinternal
  ) as reason_trigger_exists,
  coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.reject_warehouse_replenishment_request(uuid,text)'),
    'EXECUTE'
  ),false) as authenticated_can_execute_rpc;

-- Audit fields: reason and reviewer must be stored on the request.
-- Historical rejected requests may legitimately have a NULL reason.
select status,
  count(*) as count,
  count(*) filter (where rejection_reason is not null) as with_rejection_reason
from public.warehouse_replenishment_requests
where status='rejected'
group by status;
