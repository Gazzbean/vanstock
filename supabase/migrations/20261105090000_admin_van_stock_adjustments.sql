-- Administrator-only, audited van corrections. No stock rows are changed by this migration.
create or replace function public.vanstock_admin_adjust_van(
  p_van_id uuid, p_product_id uuid, p_operation text,
  p_quantity numeric, p_reference text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_actor uuid := auth.uid();
  v_company uuid;
  v_product text;
  v_unit text;
  v_archived timestamptz;
  v_van text;
  v_old numeric(12,2);
  v_new numeric(12,2);
  v_delta numeric(12,2);
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select company_id into v_company from public.profiles
    where id = v_actor and role = 'admin';
  if v_company is null then raise exception 'Administrator access required'; end if;
  if p_operation is null or p_operation not in ('add','remove','set') then
    raise exception 'Invalid adjustment operation';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity >= 1000000000
    or (p_operation <> 'set' and p_quantity = 0)
    or p_quantity <> trunc(p_quantity, 2) then
    raise exception 'Invalid adjustment quantity (maximum two decimals)';
  end if;
  if p_reference is null or length(btrim(p_reference)) = 0 or length(p_reference) > 500 then
    raise exception 'Adjustment reason/reference required (maximum 500 characters)';
  end if;

  -- Use the same product-before-van lock order as existing van and warehouse RPCs.
  select name, stock_unit, archived_at into v_product, v_unit, v_archived
    from public.products where id = p_product_id and company_id = v_company for update;
  if not found then raise exception 'Product not found for company'; end if;
  if v_archived is not null then raise exception 'Archived products cannot be adjusted'; end if;
  if v_unit is null or v_unit not in ('ea','kg','m','pack','container') then
    raise exception 'Unsupported stock unit';
  end if;
  if v_unit in ('ea','pack','container') and p_quantity <> trunc(p_quantity) then
    raise exception 'Whole-number quantity required for this product';
  end if;

  select van_number into v_van from public.vans
    where id = p_van_id and company_id = v_company for update;
  if not found then raise exception 'Van not found for company'; end if;

  select quantity into v_old from public.stock
    where van_id = p_van_id and product_id = p_product_id for update;
  v_old := coalesce(v_old, 0);
  v_new := case p_operation
    when 'add' then v_old + p_quantity
    when 'remove' then v_old - p_quantity
    else p_quantity end;
  if v_new < 0 then raise exception 'Insufficient van stock'; end if;
  if v_new >= 1000000000 then raise exception 'Quantity exceeds supported range'; end if;
  v_delta := v_new - v_old;
  if v_delta = 0 then raise exception 'No stock change to record'; end if;

  insert into public.stock (van_id, product_id, quantity, updated_at)
    values (p_van_id, p_product_id, v_new, now())
    on conflict (van_id, product_id) do update
      set quantity = excluded.quantity, updated_at = now();
  insert into public.activity_log
    (company_id, van_id, user_id, product_id, product_name, type, quantity, reference, notes)
    values (v_company, p_van_id, v_actor, p_product_id, v_product,
      'adjust', abs(v_delta), btrim(p_reference),
      'Administrator van correction. Van: ' || v_van ||
      '. Operation: ' || p_operation || '. Previous: ' || v_old || ' ' || v_unit ||
      '. New: ' || v_new || ' ' || v_unit ||
      '. Change: ' || case when v_delta > 0 then '+' else '' end || v_delta || ' ' || v_unit);
  return v_new;
end;
$body$;

revoke all on function public.vanstock_admin_adjust_van(uuid,uuid,text,numeric,text)
  from public, anon;
grant execute on function public.vanstock_admin_adjust_van(uuid,uuid,text,numeric,text)
  to authenticated;
