-- Staged warehouse replenishment: warehouse issue and receiving-van acceptance
-- are separate decisions. Inventory moves atomically only on receipt.
-- Deploy alongside the matching application release after a database backup.
begin;

alter table public.warehouse_replenishment_requests
  drop constraint if exists warehouse_replenishment_requests_status_check;
alter table public.warehouse_replenishment_requests
  add constraint warehouse_replenishment_requests_status_check
  check (status in ('pending','approved','issued','rejected','fulfilled'));
alter table public.warehouse_replenishment_requests
  add column if not exists issued_by uuid references public.profiles(id),
  add column if not exists issued_at timestamptz,
  add column if not exists received_by uuid references public.profiles(id),
  add column if not exists received_at timestamptz;

create or replace function public.process_warehouse_replenishment_request(
  p_request_id uuid, p_action text
) returns void language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := auth.uid();
 v_company uuid;
 v_role text;
 v_req public.warehouse_replenishment_requests%rowtype;
begin
 select company_id,role into v_company,v_role from public.profiles
 where id=v_actor and is_active=true;
 if v_company is null or v_role not in ('admin','manager') then
  raise exception 'Manager or administrator authorisation required';
 end if;
 if p_action is null or p_action not in ('approve','reject','fulfil') then
  raise exception 'Unknown request action';
 end if;
 select * into v_req from public.warehouse_replenishment_requests
 where id=p_request_id and company_id=v_company for update;
 if not found then raise exception 'Request not found'; end if;
 if p_action in ('approve','reject') then
  if v_req.status <> 'pending' then raise exception 'Request already reviewed'; end if;
  update public.warehouse_replenishment_requests set
   status=case when p_action='approve' then 'approved' else 'rejected' end,
   reviewed_by=v_actor,reviewed_at=now() where id=p_request_id;
 else
  if v_req.status <> 'approved' then raise exception 'Only approved requests may be issued'; end if;
  -- Serialise against warehouse movements before confirming physical issue.
  perform 1 from public.warehouse_stock
   where warehouse_id=v_req.warehouse_id and product_id=v_req.product_id
   and quantity>=v_req.quantity for update;
  if not found then raise exception 'Insufficient warehouse stock to issue requested quantity'; end if;
  update public.warehouse_replenishment_requests
   set status='issued',issued_by=v_actor,issued_at=now()
   where id=p_request_id;
 end if;
end;
$$;

create or replace function public.confirm_warehouse_replenishment_receipt(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := auth.uid();
 v_company uuid;
 v_role text;
 v_req public.warehouse_replenishment_requests%rowtype;
 v_product_name text;
 v_stock_unit text;
 v_warehouse_name text;
 v_van_name text;
 v_available numeric;
begin
 select company_id,role into v_company,v_role from public.profiles
 where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 select * into v_req from public.warehouse_replenishment_requests
 where id=p_request_id and company_id=v_company for update;
 if not found then raise exception 'Request not found'; end if;
 if v_req.status <> 'issued' then raise exception 'Warehouse has not issued this request, or receipt is already recorded'; end if;
 if v_role not in ('admin','manager') and not exists (
   select 1 from public.profiles where id=v_actor and van_id=v_req.van_id
   union all
   select 1 from public.user_authorized_vans where user_id=v_actor and van_id=v_req.van_id
 ) then raise exception 'You are not authorised to receive stock into this van'; end if;
 -- Use the same lock order as the movement engine. The receiver is authorised
 -- to accept into this van but does not require warehouse-issue permission.
 select name,stock_unit into v_product_name,v_stock_unit from public.products
 where id=v_req.product_id and company_id=v_company and archived_at is null for update;
 if v_product_name is null then raise exception 'Product is unavailable'; end if;
 select name into v_warehouse_name from public.warehouses
 where id=v_req.warehouse_id and company_id=v_company for update;
 if v_warehouse_name is null then raise exception 'Warehouse is unavailable'; end if;
 select van_number into v_van_name from public.vans
 where id=v_req.van_id and company_id=v_company and active=true for update;
 if v_van_name is null then raise exception 'Receiving van is inactive'; end if;
 if v_stock_unit in ('ea','pack','container') and v_req.quantity<>trunc(v_req.quantity) then
  raise exception 'Whole stock units required'; end if;
 select quantity into v_available from public.warehouse_stock
 where warehouse_id=v_req.warehouse_id and product_id=v_req.product_id for update;
 if v_available is null or v_available<v_req.quantity then
  raise exception 'Insufficient warehouse stock; ask the warehouse to review this issue'; end if;
 -- Inventory, audit and receipt status are one transaction.
 update public.warehouse_stock set quantity=quantity-v_req.quantity,updated_at=now()
 where warehouse_id=v_req.warehouse_id and product_id=v_req.product_id;
 insert into public.stock(van_id,product_id,quantity,updated_at)
 values(v_req.van_id,v_req.product_id,v_req.quantity,now())
 on conflict(van_id,product_id)
 do update set quantity=public.stock.quantity+excluded.quantity,updated_at=now();
 insert into public.activity_log
  (company_id,van_id,user_id,product_id,product_name,type,quantity,reference,notes)
 values(v_company,v_req.van_id,v_actor,v_req.product_id,v_product_name,
  'warehouse-to-van',v_req.quantity,
  v_warehouse_name||' / '||v_van_name||' / Request '||v_req.id::text||' / '||v_req.reference,
  'Warehouse issue accepted by receiving technician');
 update public.warehouse_replenishment_requests
 set status='fulfilled',received_by=v_actor,received_at=now(),
     fulfilled_by=v_actor,fulfilled_at=now()
 where id=p_request_id;
end;
$$;

revoke all on function public.confirm_warehouse_replenishment_receipt(uuid) from public,anon,authenticated;
grant execute on function public.confirm_warehouse_replenishment_receipt(uuid) to authenticated;

-- Remove the legacy one-click Warehouse -> Van bypass. Van -> Warehouse
-- returns still use their existing checked movement workflow.
create or replace function public.vanstock_warehouse_move(
 p_warehouse_id uuid,p_van_id uuid,p_product_id uuid,p_quantity numeric,
 p_direction text,p_reference text,p_notes text default ''
) returns void language plpgsql security definer set search_path='' as $$
declare v_reference text;
begin
 if p_direction='warehouse-to-van' then
  raise exception 'Request warehouse replenishment and obtain receiving-van confirmation';
 end if;
 if p_direction is null or p_direction<>'van-to-warehouse' then
  raise exception 'Invalid warehouse movement direction';
 end if;
 perform public.vanstock_warehouse_require_permission('receive',p_van_id);
 v_reference:=public.vanstock_next_stock_reference('TRF')
  ||case when length(btrim(coalesce(p_reference,'')))=0 then '' else ' — '||btrim(p_reference) end;
 perform public.move_warehouse_van_stock(
  p_warehouse_id,p_van_id,p_product_id,p_quantity,p_direction,v_reference,p_notes);
end;
$$;

-- Notify receiving technicians after issue; only the requester and explicitly
-- authorised users for that van (plus existing managers) receive this event.
alter table public.warehouse_notifications drop constraint if exists warehouse_notifications_event_type_check;
alter table public.warehouse_notifications add constraint warehouse_notifications_event_type_check
 check (event_type in ('requested','approved','issued','rejected','fulfilled'));

create or replace function public.vanstock_notify_warehouse_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_event text; v_actor uuid;
begin
 if TG_OP='INSERT' then
  v_event:='requested';v_actor:=NEW.requested_by;
 elsif NEW.status is distinct from OLD.status then
  if NEW.status not in ('approved','issued','rejected','fulfilled') then return NEW; end if;
  v_event:=NEW.status;
  v_actor:=case when v_event='issued' then NEW.issued_by
                when v_event='fulfilled' then NEW.received_by else NEW.reviewed_by end;
 else return NEW; end if;
 if v_event in ('requested','approved') then
  insert into public.warehouse_notifications(company_id,user_id,request_id,event_type)
  select NEW.company_id,p.id,NEW.id,v_event from public.profiles p
  where p.company_id=NEW.company_id and p.is_active=true
   and (p.role in ('admin','manager') or (v_event='approved' and exists (
    select 1 from public.user_warehouse_permissions perm
    join public.user_access_capabilities cap on cap.user_id=perm.user_id and cap.company_id=perm.company_id
    where perm.user_id=p.id and perm.company_id=NEW.company_id
      and perm.can_issue=true and cap.office_access=true)))
   and p.id is distinct from v_actor on conflict do nothing;
 end if;
 if v_event='issued' then
  insert into public.warehouse_notifications(company_id,user_id,request_id,event_type)
  select NEW.company_id,p.id,NEW.id,v_event from public.profiles p
  where p.company_id=NEW.company_id and p.is_active=true and p.id is distinct from v_actor
   and (p.id=NEW.requested_by or p.van_id=NEW.van_id or exists (
    select 1 from public.user_authorized_vans a where a.user_id=p.id and a.van_id=NEW.van_id))
  on conflict do nothing;
 end if;
 if v_event in ('approved','issued','rejected','fulfilled') and NEW.requested_by is distinct from v_actor then
  insert into public.warehouse_notifications(company_id,user_id,request_id,event_type)
  select NEW.company_id,NEW.requested_by,NEW.id,v_event
  where exists(select 1 from public.profiles p where p.id=NEW.requested_by
    and p.company_id=NEW.company_id and p.is_active=true)
  on conflict do nothing;
 end if;
 return NEW;
end;
$$;
commit;
