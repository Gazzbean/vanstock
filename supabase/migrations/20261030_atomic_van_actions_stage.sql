-- VanStock staged transactional van actions. DO NOT RUN on live Supabase.
-- Prerequisites: product UOM + warehouse decimal stock migrations.
-- This RPC replaces non-atomic adjustStock and recordTransfer reads/writes.
begin;

create or replace function public.apply_van_stock_action(
  p_product_id uuid,
  p_operation text,
  p_quantity numeric(12,3),
  p_reference text,
  p_notes text default ''
)
returns numeric(12,3)
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_van_id uuid;
  v_role text;
  v_product_name text;
  v_unit text;
  v_archived timestamptz;
  v_previous numeric(12,3);
  v_next numeric(12,3);
  v_logged_quantity numeric(12,3);
  v_log_type text;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select company_id, van_id, role
  into v_company_id, v_van_id, v_role
  from public.profiles where id = v_user_id;
  if v_company_id is null or v_van_id is null
     or v_role not in ('admin','manager','technician') then
    raise exception 'Valid assigned van required';
  end if;
  if p_operation is null or p_operation not in
    ('adjust-add','adjust-remove','adjust-set','issue','return') then
    raise exception 'Unsupported van stock operation';
  end if;
  if p_quantity is null or p_quantity < 0
    or (p_quantity = 0 and p_operation <> 'adjust-set') then
    raise exception 'Invalid stock quantity';
  end if;
  if p_quantity <> trunc(p_quantity, 3) then
    raise exception 'Maximum three decimal places permitted';
  end if;
  if p_quantity >= 1000000000 then raise exception 'Quantity exceeds supported range'; end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'A reference or reason is required';
  end if;
  if length(p_reference) > 500 or length(coalesce(p_notes,'')) > 2000 then
    raise exception 'Reference or notes too long';
  end if;

  select name, stock_unit, archived_at into v_product_name, v_unit, v_archived
  from public.products
  where id = p_product_id and company_id = v_company_id for update;
  if v_product_name is null or v_unit not in ('ea','kg','m','pack','container')
     or v_unit is null then
    raise exception 'Product does not belong to company or has invalid unit';
  end if;
  if v_archived is not null then raise exception 'Archived product cannot be changed'; end if;
  if v_unit in ('ea','pack','container') and p_quantity <> trunc(p_quantity) then
    raise exception 'Whole-number quantity required for this product';
  end if;

  -- Lock the assigned van as the common mutex for all RPC-based van operations.
  -- Warehouse RPC uses the same van-row lock before writing stock.
  perform 1 from public.vans
  where id = v_van_id and company_id = v_company_id
  for update;
  if not found then raise exception 'Assigned van does not belong to company'; end if;

  select quantity into v_previous
  from public.stock
  where van_id = v_van_id and product_id = p_product_id
  for update;
  v_previous := coalesce(v_previous, 0);

  if p_operation = 'adjust-set' then
    v_next := p_quantity;
  elsif p_operation in ('adjust-add','return') then
    v_next := v_previous + p_quantity;
  else
    if v_previous < p_quantity then
      raise exception 'Insufficient van stock';
    end if;
    v_next := v_previous - p_quantity;
  end if;

  -- Avoid stock changes and phantom audit entries when setting the same balance.
  if v_next = v_previous and p_operation = 'adjust-set' then
    return v_next;
  end if;

  insert into public.stock (van_id, product_id, quantity, updated_at)
  values (v_van_id, p_product_id, v_next, now())
  on conflict (van_id,product_id) do update
    set quantity = excluded.quantity, updated_at = now();

  v_log_type := case
    when p_operation in ('issue','return') then p_operation
    else 'adjust'
  end;
  v_logged_quantity := case
    when p_operation = 'adjust-set' then abs(v_next-v_previous)
    else p_quantity
  end;
  insert into public.activity_log
    (company_id, van_id, user_id, product_id, product_name, type, quantity, reference, notes)
  values
    (v_company_id,v_van_id,v_user_id,p_product_id,v_product_name,
     v_log_type,v_logged_quantity,p_reference,
     concat('Operation: ',p_operation,'. ',coalesce(p_notes,'')));

  return v_next;
end;
$body$;

revoke all on function public.apply_van_stock_action(uuid,text,numeric,text,text)
  from public, anon;
grant execute on function public.apply_van_stock_action(uuid,text,numeric,text,text)
  to authenticated;

commit;

-- SECURITY / ROLLOUT NOTES:
-- Existing database stock RLS still allows some direct write paths; deny those
-- after the app has been migrated and policies validated in a test project.
-- Do not expose this RPC with an admin/service credential for end-user calls.
-- Returns require an external job/customer reference; depot and van-to-van
-- are intentionally not accepted because they need both-sided location transfers.
