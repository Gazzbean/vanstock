-- Production function installed 2026-10-31. Maintains company-scoped catalogue metadata and unit-history guards.
CREATE OR REPLACE FUNCTION public.update_catalogue_product(p_product_id uuid, p_name text, p_category text, p_stock_unit text, p_min_stock numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid := auth.uid();
 v_company uuid;
 v_role text;
 v_current_unit text;
 v_name text;
begin
 if v_actor is null then raise exception 'Login required'; end if;
 select company_id, role into v_company,v_role
 from public.profiles where id=v_actor;
 if v_company is null or v_role not in ('admin','manager') then
   raise exception 'Administrator or Manager access required';
 end if;
 if p_name is null or length(btrim(p_name))=0 or length(btrim(p_name))>200
    or p_category is null or length(btrim(p_category))=0 or length(btrim(p_category))>100
 then raise exception 'Product name and category are required'; end if;
 if p_stock_unit is null or p_stock_unit not in ('ea','kg','m','pack','container') then
   raise exception 'Invalid stock unit';
 end if;
 if p_min_stock is null or p_min_stock<0 or p_min_stock>=1000000000
    or p_min_stock<>trunc(p_min_stock,2) then
   raise exception 'Invalid minimum stock quantity (maximum two decimal places)';
 end if;
 if p_stock_unit in ('ea','pack','container') and p_min_stock<>trunc(p_min_stock) then
   raise exception 'Whole-number minimum stock required for this unit';
 end if;

 -- Product lock serialises against product archive and controlled stock RPCs.
 select stock_unit into v_current_unit from public.products
 where id=p_product_id and company_id=v_company for update;
 if not found then raise exception 'Product not found for company'; end if;

 -- Once stock or audit history exists, changing the underlying unit can
 -- reinterpret all historical numbers; block instead of silently converting.
 if v_current_unit is distinct from p_stock_unit and
   (exists (select 1 from public.stock where product_id=p_product_id)
    or exists (select 1 from public.warehouse_stock where product_id=p_product_id)
    or exists (select 1 from public.warehouse_opening_entries where product_id=p_product_id)
    or exists (select 1 from public.activity_log where product_id=p_product_id))
 then raise exception 'Cannot change unit: product has stock records or transaction history'; end if;

 update public.products
 set name=btrim(p_name),category=btrim(p_category),
     stock_unit=p_stock_unit,min_stock=p_min_stock
 where id=p_product_id and company_id=v_company;
exception
 when unique_violation then
   raise exception 'A product with this name already exists in the catalogue';
end;
$function$

revoke all on function public.update_catalogue_product(uuid,text,text,text,numeric) from public,anon;
grant execute on function public.update_catalogue_product(uuid,text,text,text,numeric) to authenticated;
