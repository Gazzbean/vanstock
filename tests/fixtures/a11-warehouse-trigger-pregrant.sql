-- A11 isolated trigger regression fixture; captured from production before
-- grant-only migration (2026-11-15). Not a production migration.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as
 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
create table public.manager_operation_permissions(user_id uuid,approve_requests boolean,issue_warehouse boolean,confirm_van_receipt boolean);
create function public.vanstock_manager_has_permission(p_key text) returns boolean language plpgsql security definer as $a11$
declare v boolean;begin
 select case p_key when 'approve_requests' then approve_requests
 when 'issue_warehouse' then issue_warehouse
 when 'confirm_van_receipt' then confirm_van_receipt else false end into v
 from public.manager_operation_permissions where user_id=auth.uid();
 return coalesce(v,false);
end;$a11$;
create table public.warehouse_replenishment_requests(id uuid primary key,company_id uuid,status text);
create table public.warehouse_receipt_discrepancies(request_id uuid,resolved_at timestamptz);
CREATE OR REPLACE FUNCTION public.vanstock_block_disputed_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if old.status='issued' and new.status='fulfilled' and exists(
  select 1 from public.warehouse_receipt_discrepancies d
  where d.request_id=old.id and d.resolved_at is null
 ) then raise exception 'Outstanding receipt discrepancy: warehouse must resolve before receipt'; end if;
 return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.vanstock_enforce_manager_request_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; v_company uuid;
begin
 if new.status is not distinct from old.status then return new; end if;
 select role,company_id into v_role,v_company from public.profiles
 where id=auth.uid() and is_active=true;
 if v_role is distinct from 'manager' then return new; end if;
 if v_company is distinct from old.company_id then
  raise exception 'Request belongs to another company';
 end if;
 if old.status='pending' and new.status in ('approved','rejected') then
  if not public.vanstock_manager_has_permission('approve_requests') then
   raise exception 'Manager permission required to review warehouse requests';
  end if;
 elsif old.status='approved' and new.status='issued' then
  if not public.vanstock_manager_has_permission('issue_warehouse') then
   raise exception 'Manager permission required to issue warehouse stock';
  end if;
 elsif old.status='issued' and new.status='fulfilled' then
  if not public.vanstock_manager_has_permission('confirm_van_receipt') then
   raise exception 'Manager permission required to confirm van receipt';
  end if;
 else
  raise exception 'Unrecognised warehouse request transition';
 end if;
 return new;
end;
$function$;
create trigger block_disputed_warehouse_receipt before update on public.warehouse_replenishment_requests
 for each row execute function public.vanstock_block_disputed_receipt();
create trigger manager_warehouse_request_transition before update on public.warehouse_replenishment_requests
 for each row execute function public.vanstock_enforce_manager_request_transition();
