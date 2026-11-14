-- A03: Commit issued warehouse stock, preserving the two-confirmation workflow.
-- Recorded "on-hand" quantity remains unchanged on issue; only available
-- quantity decreases. Receipt debits on-hand and committed in one transaction.
-- An outstanding damaged/short-delivery exception retains the full commitment.
begin;
alter table public.warehouse_stock
  add column committed_quantity numeric(12,2) not null default 0;

-- Backfill is essential for installations with prior outstanding issues.
-- Never start with unreserved issued stock, or manufacture a missing balance.
do $a03$
begin
  if exists(
    select 1 from (
      select warehouse_id,product_id,sum(quantity) as committed
      from public.warehouse_replenishment_requests where status='issued'
      group by warehouse_id,product_id
    ) i left join public.warehouse_stock w
      on w.warehouse_id=i.warehouse_id and w.product_id=i.product_id
    where w.warehouse_id is null or w.quantity<i.committed
  ) then
    raise exception 'Cannot initialize stock commitments: outstanding issues exceed warehouse stock';
  end if;
end;
$a03$;
update public.warehouse_stock w
set committed_quantity=i.committed, updated_at=now()
from (
  select warehouse_id,product_id,sum(quantity)::numeric(12,2) as committed
  from public.warehouse_replenishment_requests where status='issued'
  group by warehouse_id,product_id
) i
where w.warehouse_id=i.warehouse_id and w.product_id=i.product_id;
alter table public.warehouse_stock
  add constraint warehouse_committed_quantity_valid
  check (committed_quantity>=0 and committed_quantity<=quantity);

-- Preserve existing SECURITY DEFINER identity, trigger gates and EXECUTE ACL.
CREATE OR REPLACE FUNCTION public.process_warehouse_replenishment_request(p_request_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Reserve before physical dispatch. The conditional UPDATE row-locks and
  -- checks available stock atomically; competing issues cannot use it twice.
  update public.warehouse_stock
  set committed_quantity=committed_quantity+v_req.quantity, updated_at=now()
  where warehouse_id=v_req.warehouse_id and product_id=v_req.product_id
    and quantity-committed_quantity>=v_req.quantity;
  if not found then
    raise exception 'Insufficient available warehouse stock (quantity already committed to other issued requests)';
  end if;
  update public.warehouse_replenishment_requests
   set status='issued',issued_by=v_actor,issued_at=now()
   where id=p_request_id;
 end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_warehouse_replenishment_receipt(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 v_committed numeric;
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
 select quantity,committed_quantity into v_available,v_committed from public.warehouse_stock
 where warehouse_id=v_req.warehouse_id and product_id=v_req.product_id for update;
 if v_available is null or v_available<v_req.quantity
    or v_committed is null or v_committed<v_req.quantity then
  raise exception 'Issued stock commitment is missing or warehouse quantity is insufficient; contact warehouse'; end if;
 -- Inventory, audit and receipt status are one transaction.
 update public.warehouse_stock
 set quantity=quantity-v_req.quantity,
     committed_quantity=committed_quantity-v_req.quantity,
     updated_at=now()
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
$function$;
commit;
