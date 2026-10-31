-- Staged non-destructive product archive, TEST DATABASE ONLY.
-- Requires warehouse inventory migration. No product or stock rows are deleted.
begin;

alter table public.products
  add column if not exists archived_at timestamptz;

create or replace function public.set_product_archived(
  p_product_id uuid,
  p_archive boolean
)
returns void
language plpgsql security definer
set search_path = ''
as $body$
declare
  v_company uuid;
  v_role text;
  v_current timestamptz;
begin
  select company_id, role into v_company, v_role
  from public.profiles where id = auth.uid();
  if v_company is null or v_role not in ('manager','admin') then
    raise exception 'Manager or administrator access required';
  end if;
  if p_archive is null then raise exception 'Archive state required'; end if;

  -- Concurrent archive and stock moves must share a product lock.
  -- All stock-write RPCs need to acquire this lock before altering balances.
  select archived_at into v_current
  from public.products
  where id = p_product_id and company_id = v_company for update;
  if not found then raise exception 'Product not found for company'; end if;

  if p_archive then
    -- For simplicity, retain products with any recorded remaining stock.
    if exists (
      select 1 from public.stock s
      join public.vans v on v.id = s.van_id
      where s.product_id = p_product_id
        and v.company_id = v_company and s.quantity <> 0
    ) or exists (
      select 1 from public.warehouse_stock ws
      join public.warehouses w on w.id = ws.warehouse_id
      where ws.product_id = p_product_id
        and w.company_id = v_company and ws.quantity <> 0
    ) then
      raise exception 'Product still has stock in a van or warehouse';
    end if;
  end if;

  update public.products
  set archived_at = case when p_archive then coalesce(v_current,now()) else null end
  where id = p_product_id and company_id = v_company;
end;
$body$;

revoke all on function public.set_product_archived(uuid,boolean) from public, anon;
grant execute on function public.set_product_archived(uuid,boolean) to authenticated;

commit;

-- Archive is metadata-only. Existing activity_log and stock rows remain.
-- Do not enable until all stock write RPCs lock products and reject archived items.
