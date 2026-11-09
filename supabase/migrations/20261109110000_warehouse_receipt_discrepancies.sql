-- An exception is recorded without moving stock. Resolve the physical
-- discrepancy before receiving the original issued quantity.
begin;
create table if not exists public.warehouse_receipt_discrepancies (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 request_id uuid not null unique references public.warehouse_replenishment_requests(id),
 observed_quantity numeric not null check(observed_quantity>=0),
 reason text not null check(length(btrim(reason)) between 5 and 1000),
 reported_by uuid not null references public.profiles(id),
 reported_at timestamptz not null default now(),
 resolved_by uuid references public.profiles(id),
 resolved_at timestamptz,
 resolution_note text,
 constraint discrepancy_resolution_pair check ((resolved_at is null and resolved_by is null and resolution_note is null) or (resolved_at is not null and resolved_by is not null and length(btrim(resolution_note))>=5))
);
create index if not exists warehouse_receipt_discrepancies_company_idx on public.warehouse_receipt_discrepancies(company_id);
alter table public.warehouse_receipt_discrepancies enable row level security;
revoke all on public.warehouse_receipt_discrepancies from anon,authenticated;
alter table public.warehouse_notifications drop constraint if exists warehouse_notifications_event_type_check;
alter table public.warehouse_notifications add constraint warehouse_notifications_event_type_check
 check(event_type in ('requested','approved','issued','rejected','fulfilled','discrepancy'));

create or replace function public.report_warehouse_receipt_discrepancy(p_request_id uuid,p_observed_quantity numeric,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_company uuid;v_role text;v_req public.warehouse_replenishment_requests%rowtype;
begin
 select company_id,role into v_company,v_role from public.profiles where id=v_actor and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 select * into v_req from public.warehouse_replenishment_requests where id=p_request_id and company_id=v_company for update;
 if not found or v_req.status<>'issued' then raise exception 'Only issued requests can be reported'; end if;
 if v_role<>'admin' and not (
  (v_role='manager' and public.vanstock_manager_has_permission('receive_returns')) or
  exists(select 1 from public.profiles where id=v_actor and van_id=v_req.van_id) or
  exists(select 1 from public.user_authorized_vans where user_id=v_actor and van_id=v_req.van_id)
 ) then raise exception 'Not authorised for the receiving van'; end if;
 if p_observed_quantity is null or p_observed_quantity<0 or p_observed_quantity>v_req.quantity then
  raise exception 'Reported quantity must be between zero and the issued quantity';
 end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Explain the discrepancy'; end if;
 insert into public.warehouse_receipt_discrepancies
 (company_id,request_id,observed_quantity,reason,reported_by)
 values(v_company,p_request_id,p_observed_quantity,btrim(p_reason),v_actor);
 insert into public.warehouse_notifications(company_id,user_id,request_id,event_type)
 select v_company,p.id,p_request_id,'discrepancy' from public.profiles p
 where p.company_id=v_company and p.is_active=true and p.id is distinct from v_actor
 and (p.role='admin' or (p.role='manager' and exists(
  select 1 from public.manager_operation_permissions m
  where m.user_id=p.id and m.company_id=v_company and m.issue_warehouse=true)))
 on conflict do nothing;
end;
$$;
revoke all on function public.report_warehouse_receipt_discrepancy(uuid,numeric,text) from public,anon;
grant execute on function public.report_warehouse_receipt_discrepancy(uuid,numeric,text) to authenticated;

create or replace function public.resolve_warehouse_receipt_discrepancy(p_request_id uuid,p_resolution_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_company uuid;v_role text;v_req public.warehouse_replenishment_requests%rowtype;
begin
 select company_id,role into v_company,v_role from public.profiles where id=v_actor and is_active=true;
 if v_company is null or not public.vanstock_manager_has_permission('issue_warehouse') then
  raise exception 'Warehouse issue authorisation required';
 end if;
 if length(btrim(coalesce(p_resolution_note,''))) not between 5 and 1000 then raise exception 'Record how the issued quantity was reconciled'; end if;
 select * into v_req from public.warehouse_replenishment_requests where id=p_request_id and company_id=v_company and status='issued' for update;
 if not found then raise exception 'Issued request not found'; end if;
 update public.warehouse_receipt_discrepancies
 set resolved_by=v_actor,resolved_at=now(),resolution_note=btrim(p_resolution_note)
 where request_id=p_request_id and company_id=v_company and resolved_at is null;
 if not found then raise exception 'No open discrepancy found'; end if;
end;
$$;
revoke all on function public.resolve_warehouse_receipt_discrepancy(uuid,text) from public,anon;
grant execute on function public.resolve_warehouse_receipt_discrepancy(uuid,text) to authenticated;

-- Guards every path to final receipt, including direct RPC calls.
create or replace function public.vanstock_block_disputed_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='issued' and new.status='fulfilled' and exists(
  select 1 from public.warehouse_receipt_discrepancies d
  where d.request_id=old.id and d.resolved_at is null
 ) then raise exception 'Outstanding receipt discrepancy: warehouse must resolve before receipt'; end if;
 return new;
end;
$$;
drop trigger if exists block_disputed_warehouse_receipt on public.warehouse_replenishment_requests;
create trigger block_disputed_warehouse_receipt before update of status
on public.warehouse_replenishment_requests for each row
execute function public.vanstock_block_disputed_receipt();
commit;
