-- Apply only after review and a database backup. This migration changes no existing stock.
-- One atomic, authenticated transfer: both stock balances and both audit entries commit together.
-- Assumes the existing public.vans, products, profiles, stock and activity_log schema.
create or replace function public.transfer_between_vans(
  p_product_id uuid,
  p_destination_van_id uuid,
  p_quantity integer,
  p_reference text default '',
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_source_van_id uuid;
  v_source_label text;
  v_destination_label text;
  v_product_name text;
  v_available integer;
  v_locked_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be a positive whole number';
  end if;

  select company_id, van_id
    into v_company_id, v_source_van_id
    from public.profiles
   where id = v_user_id;

  if v_company_id is null or v_source_van_id is null then
    raise exception 'User must be assigned to a company and van';
  end if;

  if p_destination_van_id is null or p_destination_van_id = v_source_van_id then
    raise exception 'Select a different receiving van';
  end if;

  -- Serialise transfers involving either van, including concurrent first-time stock rows.
  -- Lock consistently in UUID order to minimise deadlocks.
  select count(*) into v_locked_count
    from (
      select id
      from public.vans
      where id in (v_source_van_id, p_destination_van_id)
        and company_id = v_company_id
      order by id
      for update
    ) locked_vans;

  if v_locked_count <> 2 then
    raise exception 'Receiving van is not part of your company';
  end if;

  select van_number into v_source_label from public.vans where id = v_source_van_id;
  select van_number into v_destination_label from public.vans where id = p_destination_van_id;

  select name into v_product_name
    from public.products
   where id = p_product_id and company_id = v_company_id;
  if v_product_name is null then
    raise exception 'Product is not part of your company';
  end if;

  select quantity into v_available
    from public.stock
   where van_id = v_source_van_id and product_id = p_product_id
   for update;

  if v_available is null or v_available < p_quantity then
    raise exception 'Insufficient stock on the sending van';
  end if;

  update public.stock
     set quantity = quantity - p_quantity, updated_at = now()
   where van_id = v_source_van_id and product_id = p_product_id;

  insert into public.stock (van_id, product_id, quantity, updated_at)
  values (p_destination_van_id, p_product_id, p_quantity, now())
  on conflict (van_id, product_id)
  do update set quantity = public.stock.quantity + excluded.quantity, updated_at = now();

  insert into public.activity_log
    (company_id, van_id, user_id, product_id, product_name, type, quantity, reference, notes)
  values
    (v_company_id, v_source_van_id, v_user_id, p_product_id, v_product_name,
     'van-to-van', p_quantity,
     'To ' || v_destination_label || case when nullif(btrim(p_reference), '') is not null then ' | ' || btrim(p_reference) else '' end,
     nullif(btrim(p_notes), '')),
    (v_company_id, p_destination_van_id, v_user_id, p_product_id, v_product_name,
     'van-to-van', p_quantity,
     'From ' || v_source_label || case when nullif(btrim(p_reference), '') is not null then ' | ' || btrim(p_reference) else '' end,
     nullif(btrim(p_notes), ''));
end;
$$;

revoke all on function public.transfer_between_vans(uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.transfer_between_vans(uuid, uuid, integer, text, text) to authenticated;
