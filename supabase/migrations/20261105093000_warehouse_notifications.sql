-- Warehouse request notifications: transactional, company-scoped and private.
-- Existing requests are deliberately not replayed as new notifications.
begin;

create table if not exists public.warehouse_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references public.profiles(id),
  request_id uuid not null references public.warehouse_replenishment_requests(id),
  event_type text not null check (event_type in ('requested','approved','rejected','fulfilled')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id,request_id,event_type)
);
create index if not exists warehouse_notifications_inbox
  on public.warehouse_notifications(user_id,company_id,created_at desc);
alter table public.warehouse_notifications enable row level security;
revoke all on public.warehouse_notifications from public,anon,authenticated;

create or replace function public.vanstock_notify_warehouse_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
 v_event text;
 v_actor uuid;
begin
 if TG_OP = 'INSERT' then
   v_event := 'requested'; v_actor := NEW.requested_by;
 elsif NEW.status is distinct from OLD.status then
   if NEW.status not in ('approved','rejected','fulfilled') then return NEW; end if;
   v_event := NEW.status;
   v_actor := case when NEW.status='fulfilled' then NEW.fulfilled_by else NEW.reviewed_by end;
 else return NEW;
 end if;

 -- Managers handle new requests and fulfil approved requests. The requester
 -- receives subsequent decisions. Nobody is notified of their own action.
 if v_event in ('requested','approved') then
   insert into public.warehouse_notifications(company_id,user_id,request_id,event_type)
   select NEW.company_id,p.id,NEW.id,v_event from public.profiles p
   where p.company_id=NEW.company_id and p.is_active=true
     and (p.role in ('admin','manager') or (v_event='approved' and exists (
       select 1 from public.user_warehouse_permissions perm
       join public.user_access_capabilities cap on cap.user_id=perm.user_id
         and cap.company_id=perm.company_id
       where perm.user_id=p.id and perm.company_id=NEW.company_id
         and perm.can_issue=true and cap.office_access=true
     ))) and p.id is distinct from v_actor
   on conflict do nothing;
 end if;
 if v_event in ('approved','rejected','fulfilled') and NEW.requested_by is distinct from v_actor then
   insert into public.warehouse_notifications(company_id,user_id,request_id,event_type)
   select NEW.company_id,NEW.requested_by,NEW.id,v_event
   where exists(select 1 from public.profiles p where p.id=NEW.requested_by
     and p.company_id=NEW.company_id and p.is_active=true)
   on conflict do nothing;
 end if;
 return NEW;
end;
$$;

drop trigger if exists warehouse_request_notify on public.warehouse_replenishment_requests;
create trigger warehouse_request_notify after insert or update of status
on public.warehouse_replenishment_requests for each row
execute function public.vanstock_notify_warehouse_request();

revoke all on function public.vanstock_notify_warehouse_request() from public,anon,authenticated;

create or replace function public.vanstock_mark_warehouse_notification_read(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_company uuid;
begin
 select company_id into v_company from public.profiles
 where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 update public.warehouse_notifications set read_at=coalesce(read_at,now())
 where id=p_id and user_id=v_actor and company_id=v_company;
 return found;
end;
$$;
revoke all on function public.vanstock_mark_warehouse_notification_read(uuid) from public,anon;
grant execute on function public.vanstock_mark_warehouse_notification_read(uuid) to authenticated;
commit;
