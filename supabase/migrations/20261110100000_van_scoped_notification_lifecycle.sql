-- Keep the private inbox user-specific while making pending receiving duties
-- follow current authorised van assignments. Preserve all event rows for history.
begin;

-- When a request advances, older stage notifications are no longer actionable.
create or replace function public.vanstock_archive_superseded_warehouse_notifications()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    update public.warehouse_notifications n
       set dismissed_at = coalesce(n.dismissed_at, now()),
           read_at = coalesce(n.read_at, now())
     where n.company_id = new.company_id
       and n.request_id = new.id
       and n.event_type <> new.status
       and n.dismissed_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_request_archive_superseded_notifications
  on public.warehouse_replenishment_requests;
create trigger warehouse_request_archive_superseded_notifications
after update of status on public.warehouse_replenishment_requests
for each row execute function public.vanstock_archive_superseded_warehouse_notifications();
revoke all on function public.vanstock_archive_superseded_warehouse_notifications()
  from public, anon, authenticated;

-- A newly assigned receiving technician gets an inbox event for currently
-- outstanding issued goods. The unique inbox key prevents duplicate alerts.
create or replace function public.vanstock_sync_receiving_notifications_on_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.warehouse_notifications(company_id, user_id, request_id, event_type)
    select new.company_id, new.user_id, r.id, 'issued'
      from public.warehouse_replenishment_requests r
      join public.profiles p on p.id = new.user_id
       and p.company_id = new.company_id and p.is_active = true
      join public.user_access_capabilities cap on cap.user_id = p.id
       and cap.company_id = p.company_id and cap.technician_access = true
     where r.company_id = new.company_id
       and r.van_id = new.van_id and r.status = 'issued'
    on conflict (user_id, request_id, event_type) do nothing;
  elsif tg_op = 'DELETE' then
    -- Removing a van removes that van's pending receiving alert from the
    -- user's active inbox. It does not remove the historical notification.
    update public.warehouse_notifications n
       set dismissed_at = coalesce(n.dismissed_at, now()),
           read_at = coalesce(n.read_at, now())
      from public.warehouse_replenishment_requests r
     where r.id = n.request_id
       and r.company_id = old.company_id
       and r.van_id = old.van_id and r.status = 'issued'
       and n.company_id = old.company_id and n.user_id = old.user_id
       and n.event_type = 'issued' and n.dismissed_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists vanstock_receiving_notifications_assignment
  on public.user_authorized_vans;
create trigger vanstock_receiving_notifications_assignment
after insert or delete on public.user_authorized_vans
for each row execute function public.vanstock_sync_receiving_notifications_on_assignment();
revoke all on function public.vanstock_sync_receiving_notifications_on_assignment()
  from public, anon, authenticated;

-- One-time clean-up of obsolete active notifications. No history is deleted.
update public.warehouse_notifications n
   set dismissed_at = coalesce(n.dismissed_at, now()),
       read_at = coalesce(n.read_at, now())
  from public.warehouse_replenishment_requests r
 where r.id = n.request_id and r.company_id = n.company_id
   and n.event_type <> r.status and n.dismissed_at is null;

commit;
