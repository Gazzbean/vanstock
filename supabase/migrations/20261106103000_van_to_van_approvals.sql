-- Two-sided van transfers: requests are non-posting. Stock moves only when
-- an authorised receiving technician confirms or management records an override.
create table public.van_transfer_requests (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 source_van_id uuid not null references public.vans(id),
 destination_van_id uuid not null references public.vans(id),
 product_id uuid not null references public.products(id),
 quantity numeric(12,2) not null check (quantity>0),
 reason text not null check (length(btrim(reason)) between 3 and 500),
 status text not null default 'pending' check (status in ('pending','completed','rejected')),
 requested_by uuid not null references public.profiles(id),
 decided_by uuid references public.profiles(id),
 decision_reason text,
 transaction_reference text,
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 check (source_van_id<>destination_van_id)
);
create index van_transfer_requests_company_status_date
 on public.van_transfer_requests(company_id,status,created_at desc);
create index van_transfer_requests_destination_pending
 on public.van_transfer_requests(company_id,destination_van_id,created_at desc)
 where status='pending';
alter table public.van_transfer_requests enable row level security;
revoke all on public.van_transfer_requests from public,anon,authenticated;

create function public.vanstock_request_van_transfer(
 p_source_van_id uuid,p_destination_van_id uuid,p_product_id uuid,
 p_quantity numeric,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid(); v_company uuid; v_office boolean; v_request_id uuid;
 v_unit text; v_current numeric;
begin
 select company_id into v_company from public.profiles
  where id=v_uid and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 select coalesce(office_access,false) into v_office from public.user_access_capabilities
  where user_id=v_uid and company_id=v_company;
 if not coalesce(v_office,false) and not exists(
  select 1 from public.user_authorized_vans
  where user_id=v_uid and company_id=v_company and van_id=p_source_van_id
 ) then raise exception 'You cannot transfer stock from this van'; end if;
 if p_source_van_id is null or p_destination_van_id is null
  or p_source_van_id=p_destination_van_id then raise exception 'Choose two different vans'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>=1000000000
  or p_quantity<>trunc(p_quantity,2) then raise exception 'Invalid transfer quantity'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
  raise exception 'Enter a reason for the transfer'; end if;
 if (select count(*) from public.vans where company_id=v_company and active=true
  and id in (p_source_van_id,p_destination_van_id))<>2 then
  raise exception 'The selected vans are not active in your company'; end if;
 select stock_unit into v_unit from public.products
  where id=p_product_id and company_id=v_company and archived_at is null;
 if v_unit is null then raise exception 'Active product not found'; end if;
 if v_unit in ('ea','pack','container','roll') and p_quantity<>trunc(p_quantity) then
  raise exception 'Whole item quantity required'; end if;
 select quantity into v_current from public.stock
  where van_id=p_source_van_id and product_id=p_product_id;
 if v_current is null or v_current<p_quantity then
  raise exception 'Insufficient source van stock'; end if;
 insert into public.van_transfer_requests(
  company_id,source_van_id,destination_van_id,product_id,quantity,reason,requested_by
 ) values(v_company,p_source_van_id,p_destination_van_id,p_product_id,
  p_quantity,btrim(p_reason),v_uid) returning id into v_request_id;
 return v_request_id;
end;
$$;

create function public.vanstock_decide_van_transfer(
 p_request_id uuid,p_approve boolean,p_decision_reason text default null
) returns text language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid(); v_company uuid; v_office boolean; v_role text;
 v_receiver boolean; v_request public.van_transfer_requests%rowtype;
 v_current numeric; v_source_label text; v_destination_label text;
 v_product_label text; v_unit text; v_ref text;
begin
 select company_id,role into v_company,v_role from public.profiles
  where id=v_uid and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 select coalesce(office_access,false) into v_office from public.user_access_capabilities
  where user_id=v_uid and company_id=v_company;
 select * into v_request from public.van_transfer_requests
  where id=p_request_id and company_id=v_company for update;
 if not found then raise exception 'Transfer request not found'; end if;
 if v_request.status<>'pending' then raise exception 'Transfer request already decided'; end if;
 select exists(select 1 from public.user_authorized_vans a
  join public.vans v on v.id=a.van_id and v.company_id=a.company_id and v.active=true
  where a.user_id=v_uid and a.company_id=v_company
   and a.van_id=v_request.destination_van_id) into v_receiver;
 if not v_receiver then
  if not coalesce(v_office,false) or v_role not in ('admin','manager') then
   raise exception 'Only the receiving van technician or management may decide'; end if;
  if length(btrim(coalesce(p_decision_reason,''))) not between 3 and 500 then
   raise exception 'Management override requires an explanation'; end if;
 end if;
 if not coalesce(p_approve,false) then
  update public.van_transfer_requests set status='rejected',decided_by=v_uid,
   decided_at=now(),decision_reason=coalesce(nullif(btrim(p_decision_reason),''),'Rejected by receiving technician')
   where id=p_request_id;
  return 'Rejected';
 end if;
 -- Lock both vehicles in a consistent order before reading or changing balances.
 perform 1 from public.vans where company_id=v_company
  and id in (v_request.source_van_id,v_request.destination_van_id)
  and active=true order by id for update;
 if (select count(*) from public.vans where company_id=v_company and active=true
  and id in (v_request.source_van_id,v_request.destination_van_id))<>2 then
  raise exception 'A van has been deactivated'; end if;
 select name,stock_unit into v_product_label,v_unit from public.products
  where id=v_request.product_id and company_id=v_company and archived_at is null for update;
 if v_product_label is null then raise exception 'Active product not found'; end if;
 select quantity into v_current from public.stock
  where van_id=v_request.source_van_id and product_id=v_request.product_id for update;
 if v_current is null or v_current<v_request.quantity then
  raise exception 'Insufficient source van stock; transfer not completed'; end if;
 update public.stock set quantity=quantity-v_request.quantity,updated_at=now()
  where van_id=v_request.source_van_id and product_id=v_request.product_id;
 insert into public.stock(van_id,product_id,quantity,updated_at)
 values(v_request.destination_van_id,v_request.product_id,v_request.quantity,now())
 on conflict(van_id,product_id) do update
  set quantity=public.stock.quantity+excluded.quantity,updated_at=now();
 v_ref:=public.vanstock_next_stock_reference('TRF');
 select van_number into v_source_label from public.vans where id=v_request.source_van_id;
 select van_number into v_destination_label from public.vans where id=v_request.destination_van_id;
 insert into public.activity_log(
  company_id,van_id,user_id,product_id,product_name,type,quantity,reference,notes
 ) values(v_company,v_request.source_van_id,v_uid,v_request.product_id,v_product_label,
  'van-to-van',v_request.quantity,v_ref,
  v_source_label||' → '||v_destination_label||'. Reason: '||v_request.reason||
  case when v_receiver then ' Confirmed by receiving van.'
   else ' Management override: '||btrim(p_decision_reason) end);
 update public.van_transfer_requests set status='completed',decided_by=v_uid,
  decided_at=now(),decision_reason=case when v_receiver then null else btrim(p_decision_reason) end,
  transaction_reference=v_ref where id=p_request_id;
 return v_ref;
end;
$$;

revoke all on function public.vanstock_request_van_transfer(uuid,uuid,uuid,numeric,text)
 from public,anon;
revoke all on function public.vanstock_decide_van_transfer(uuid,boolean,text)
 from public,anon;
grant execute on function public.vanstock_request_van_transfer(uuid,uuid,uuid,numeric,text)
 to authenticated;
grant execute on function public.vanstock_decide_van_transfer(uuid,boolean,text)
 to authenticated;
