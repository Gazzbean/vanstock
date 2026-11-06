-- A human-readable reference is generated inside the same transaction as a
-- warehouse/van movement, adjustment or opening stocktake. No stock is changed
-- by this migration. Existing references and historical records are untouched.
create table if not exists public.stock_reference_counters (
 company_id uuid not null references public.companies(id),
 reference_date date not null,
 kind text not null check (kind in ('TRF','ADJ','STK')),
 last_number integer not null check (last_number > 0),
 primary key (company_id,reference_date,kind)
);
alter table public.stock_reference_counters enable row level security;
revoke all on public.stock_reference_counters from public,anon,authenticated;

create or replace function public.vanstock_next_stock_reference(p_kind text)
returns text language plpgsql security definer set search_path='' as $$
declare
 v_company uuid;
 v_day date := (now() at time zone 'Australia/Perth')::date;
 v_number integer;
begin
 if p_kind not in ('TRF','ADJ','STK') or p_kind is null then
  raise exception 'Unsupported stock reference type';
 end if;
 select company_id into v_company from public.profiles
 where id=auth.uid() and is_active=true;
 if v_company is null then raise exception 'Active login required'; end if;
 insert into public.stock_reference_counters(company_id,reference_date,kind,last_number)
 values(v_company,v_day,p_kind,1)
 on conflict(company_id,reference_date,kind)
 do update set last_number=public.stock_reference_counters.last_number+1
 returning last_number into v_number;
 return p_kind||'-'||to_char(v_day,'YYYYMMDD')||'-'||lpad(v_number::text,3,'0');
end;
$$;
revoke all on function public.vanstock_next_stock_reference(text) from public,anon,authenticated;

-- Preserve existing signatures and permission checks. Every movement receives
-- a generated TRF; an optional job/replenishment reference is retained after it.
create or replace function public.vanstock_warehouse_move(
 p_warehouse_id uuid,p_van_id uuid,p_product_id uuid,p_quantity numeric,
 p_direction text,p_reference text,p_notes text default ''
) returns void language plpgsql security definer set search_path='' as $$
declare v_reference text;
begin
 if p_direction not in ('warehouse-to-van','van-to-warehouse') or p_direction is null then
  raise exception 'Invalid warehouse movement direction';
 end if;
 perform public.vanstock_warehouse_require_permission(
  case when p_direction='warehouse-to-van' then 'issue' else 'receive' end,p_van_id);
 v_reference:=public.vanstock_next_stock_reference('TRF')
  ||case when length(btrim(coalesce(p_reference,'')))=0 then ''
   else ' — '||btrim(p_reference) end;
 perform public.move_warehouse_van_stock(
  p_warehouse_id,p_van_id,p_product_id,p_quantity,p_direction,v_reference,p_notes);
end;
$$;

-- Adjustment reason remains compulsory; the generated ID is a prefix, not a
-- substitute for the reason. 'Set' operations are stocktake-type corrections.
create or replace function public.vanstock_warehouse_adjust(
 p_warehouse_id uuid,p_product_id uuid,p_operation text,p_quantity numeric,p_reference text
) returns numeric language plpgsql security definer set search_path='' as $$
declare v_reference text;
begin
 perform public.vanstock_warehouse_require_permission('adjust');
 if length(btrim(coalesce(p_reference,'')))=0 then
  raise exception 'Adjustment reason is required';
 end if;
 v_reference:=public.vanstock_next_stock_reference(
  case when p_operation='set' then 'STK' else 'ADJ' end)
  ||' — '||btrim(p_reference);
 return public.adjust_warehouse_stock(p_warehouse_id,p_product_id,p_operation,p_quantity,v_reference);
end;
$$;

create or replace function public.vanstock_warehouse_opening_stock(
 p_warehouse_id uuid,p_product_id uuid,p_count numeric,p_stocktake_reference text
) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.vanstock_warehouse_require_permission('stocktake');
 if length(btrim(coalesce(p_stocktake_reference,'')))=0 then
  raise exception 'Approved stocktake reason is required';
 end if;
 perform public.post_warehouse_opening_stock(
  p_warehouse_id,p_product_id,p_count,
  public.vanstock_next_stock_reference('STK')||' — '||btrim(p_stocktake_reference));
end;
$$;
