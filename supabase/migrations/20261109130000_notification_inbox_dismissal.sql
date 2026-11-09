-- Dismiss changes only per-user inbox visibility. Notification rows and all
-- associated requests, movements and audit records remain intact.
begin;
alter table public.warehouse_notifications
 add column if not exists dismissed_at timestamptz;
create index if not exists warehouse_notifications_visible_idx
 on public.warehouse_notifications(user_id,company_id,created_at desc)
 where dismissed_at is null;

create or replace function public.vanstock_dismiss_warehouse_notification(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_company uuid;
begin
 select company_id into v_company from public.profiles where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 update public.warehouse_notifications
 set read_at=coalesce(read_at,now()),dismissed_at=coalesce(dismissed_at,now())
 where id=p_id and company_id=v_company and user_id=v_actor;
 return found;
end;
$$;
revoke all on function public.vanstock_dismiss_warehouse_notification(uuid) from public,anon;
grant execute on function public.vanstock_dismiss_warehouse_notification(uuid) to authenticated;

create or replace function public.vanstock_clear_read_warehouse_notifications()
returns integer language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_company uuid;v_count integer;
begin
 select company_id into v_company from public.profiles where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 update public.warehouse_notifications set dismissed_at=now()
 where user_id=v_actor and company_id=v_company
  and read_at is not null and dismissed_at is null;
 get diagnostics v_count=row_count;
 return v_count;
end;
$$;
revoke all on function public.vanstock_clear_read_warehouse_notifications() from public,anon;
grant execute on function public.vanstock_clear_read_warehouse_notifications() to authenticated;
commit;
