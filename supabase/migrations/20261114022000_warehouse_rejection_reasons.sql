-- DEV-028B: Require an auditable reason for all new warehouse request rejections.
-- Historic rejected requests are retained with NULL reasons; never backfill invented text.
begin;

alter table public.warehouse_replenishment_requests
  add column if not exists rejection_reason text;

-- Make the migration re-runnable if a separate database migration ledger
-- already recorded the controlled deployment.
do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'warehouse_replenishment_rejection_reason_length'
      and conrelid = 'public.warehouse_replenishment_requests'::regclass
  ) then
    alter table public.warehouse_replenishment_requests
      add constraint warehouse_replenishment_rejection_reason_length
      check (
        rejection_reason is null
        or char_length(btrim(rejection_reason)) between 3 and 500
      );
  end if;
end;
$constraint$;

-- Database-level guarantee covers the existing two-argument decision RPC,
-- direct status changes and future clients. Existing historical rows remain valid.
create or replace function public.vanstock_require_warehouse_rejection_reason()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.status = 'rejected'
       and NEW.rejection_reason is distinct from OLD.rejection_reason then
      raise exception 'A recorded rejection reason cannot be changed';
    end if;
  end if;

  if NEW.status = 'rejected'
     and char_length(btrim(coalesce(NEW.rejection_reason,''))) < 3 then
    raise exception 'Rejection requires a reason of at least 3 characters';
  end if;
  return NEW;
end;
$$;

drop trigger if exists warehouse_replenishment_rejection_reason_guard
on public.warehouse_replenishment_requests;
create trigger warehouse_replenishment_rejection_reason_guard
  before insert or update of status,rejection_reason
  on public.warehouse_replenishment_requests
  for each row
  execute function public.vanstock_require_warehouse_rejection_reason();

revoke all on function public.vanstock_require_warehouse_rejection_reason()
  from public, anon, authenticated;

-- Dedicated RPC prevents PostgREST function overloading. Existing approval and
-- issue RPC remains unchanged; its legacy reject path is blocked by the trigger.
create or replace function public.reject_warehouse_replenishment_request(
  p_request_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_req public.warehouse_replenishment_requests%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select company_id, role into v_company, v_role
  from public.profiles
  where id = v_actor and is_active = true;

  if v_company is null or v_role not in ('admin', 'manager') then
    raise exception 'Manager or administrator authorisation required';
  end if;

  if char_length(v_reason) not between 3 and 500 then
    raise exception 'Enter a rejection reason between 3 and 500 characters';
  end if;

  select * into v_req
  from public.warehouse_replenishment_requests
  where id = p_request_id and company_id = v_company
  for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status <> 'pending' then
    raise exception 'Request already reviewed';
  end if;

  -- Existing manager transition trigger verifies manager_operation_permissions.
  -- This update also produces the normal rejection notification.
  update public.warehouse_replenishment_requests
  set status = 'rejected',
      rejection_reason = v_reason,
      reviewed_by = v_actor,
      reviewed_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.reject_warehouse_replenishment_request(uuid,text)
  from public, anon, authenticated;
grant execute on function public.reject_warehouse_replenishment_request(uuid,text)
  to authenticated;

commit;
