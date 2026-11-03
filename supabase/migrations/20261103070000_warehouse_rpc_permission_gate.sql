-- STAGED: close direct authenticated access to legacy SECURITY DEFINER stock RPCs.
-- No balances are touched by this migration. Apply with the server-action release.
-- Managers/admins retain their existing management authority. Technician issue and
-- receive must have a saved grant and the receiving/source van must be their default.
begin;

create or replace function public.vanstock_warehouse_require_permission(p_action text,p_van_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_default_van uuid;
  v_permitted boolean;
begin
  select company_id,role,van_id into v_company,v_role,v_default_van
  from public.profiles where id=v_user and is_active=true;
  if v_company is null then raise exception 'Active login required'; end if;
  if p_action not in ('issue','receive','adjust','stocktake') or p_action is null then
    raise exception 'Unknown warehouse operation';
  end if;
  if v_role in ('admin','manager') then return; end if;
  if v_role <> 'technician' then raise exception 'Warehouse operation not authorised'; end if;
  -- Stocktakes and adjustments are restricted to management pending an approved
  -- technician workflow (count reconciliation, independent approval and audit).
  if p_action in ('adjust','stocktake') then
    raise exception 'Warehouse adjustments and stocktakes require management approval';
  end if;
  if p_van_id is null or v_default_van is distinct from p_van_id then
    raise exception 'Warehouse movement restricted to assigned default van';
  end if;
  select case when p_action='issue' then coalesce(can_issue,false)
              else coalesce(can_receive,false) end into v_permitted
  from public.user_warehouse_permissions where user_id=v_user and company_id=v_company;
  if not coalesce(v_permitted,false) then
    raise exception 'Warehouse % permission required',p_action;
  end if;
end;
$$;
revoke all on function public.vanstock_warehouse_require_permission(text,uuid) from public,anon;
grant execute on function public.vanstock_warehouse_require_permission(text,uuid) to authenticated;

-- Controlled wrappers keep the original transactional movement and audit code
-- unchanged; the original RPCs are now inaccessible to authenticated clients.
create or replace function public.vanstock_warehouse_move(
  p_warehouse_id uuid,p_van_id uuid,p_product_id uuid,p_quantity numeric,
  p_direction text,p_reference text,p_notes text default ''
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_direction not in ('warehouse-to-van','van-to-warehouse') or p_direction is null then
    raise exception 'Invalid warehouse movement direction';
  end if;
  perform public.vanstock_warehouse_require_permission(
    case when p_direction='warehouse-to-van' then 'issue' else 'receive' end,p_van_id);
  perform public.move_warehouse_van_stock(
    p_warehouse_id,p_van_id,p_product_id,p_quantity,p_direction,p_reference,p_notes);
end;
$$;

create or replace function public.vanstock_warehouse_adjust(
  p_warehouse_id uuid,p_product_id uuid,p_operation text,p_quantity numeric,p_reference text
) returns numeric language plpgsql security definer set search_path = '' as $$
begin
  perform public.vanstock_warehouse_require_permission('adjust');
  return public.adjust_warehouse_stock(p_warehouse_id,p_product_id,p_operation,p_quantity,p_reference);
end;
$$;

create or replace function public.vanstock_warehouse_opening_stock(
  p_warehouse_id uuid,p_product_id uuid,p_count numeric,p_stocktake_reference text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.vanstock_warehouse_require_permission('stocktake');
  perform public.post_warehouse_opening_stock(p_warehouse_id,p_product_id,p_count,p_stocktake_reference);
end;
$$;

revoke all on function public.move_warehouse_van_stock(uuid,uuid,uuid,numeric,text,text,text)
  from public,anon,authenticated;
revoke all on function public.adjust_warehouse_stock(uuid,uuid,text,numeric,text)
  from public,anon,authenticated;
revoke all on function public.post_warehouse_opening_stock(uuid,uuid,numeric,text)
  from public,anon,authenticated;
revoke all on function public.vanstock_warehouse_move(uuid,uuid,uuid,numeric,text,text,text)
  from public,anon;
revoke all on function public.vanstock_warehouse_adjust(uuid,uuid,text,numeric,text)
  from public,anon;
revoke all on function public.vanstock_warehouse_opening_stock(uuid,uuid,numeric,text)
  from public,anon;
grant execute on function public.vanstock_warehouse_move(uuid,uuid,uuid,numeric,text,text,text)
  to authenticated;
grant execute on function public.vanstock_warehouse_adjust(uuid,uuid,text,numeric,text)
  to authenticated;
grant execute on function public.vanstock_warehouse_opening_stock(uuid,uuid,numeric,text)
  to authenticated;

commit;
