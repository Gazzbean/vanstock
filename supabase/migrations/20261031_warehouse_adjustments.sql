-- Deployed on VanStock production on 2026-10-31.
-- Audited warehouse adjustment function; production source-of-truth snapshot.
CREATE OR REPLACE FUNCTION public.adjust_warehouse_stock(p_warehouse_id uuid, p_product_id uuid, p_operation text, p_quantity numeric, p_reference text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid := auth.uid();
 v_company uuid;
 v_role text;
 v_product text;
 v_unit text;
 v_archived timestamptz;
 v_warehouse text;
 v_old numeric(12,2);
 v_new numeric(12,2);
 v_delta numeric(12,2);
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 select company_id, role into v_company,v_role from public.profiles where id=v_actor;
 if v_company is null or v_role not in ('admin','manager') then
   raise exception 'Administrator or Manager required';
 end if;
 if p_operation is null or p_operation not in ('add','remove','set') then
   raise exception 'Invalid adjustment operation';
 end if;
 if p_quantity is null or p_quantity < 0 or
   (p_operation <> 'set' and p_quantity=0) or p_quantity >= 1000000000 then
   raise exception 'Invalid adjustment quantity';
 end if;
 if p_quantity <> trunc(p_quantity,2) then
   raise exception 'Maximum two decimal places permitted';
 end if;
 if p_reference is null or length(btrim(p_reference))=0 or length(p_reference)>500 then
   raise exception 'Adjustment reason/reference required (maximum 500 characters)';
 end if;

 -- Same lock order as other stock functions: product then warehouse.
 select name,stock_unit,archived_at into v_product,v_unit,v_archived
 from public.products where id=p_product_id and company_id=v_company for update;
 if not found then raise exception 'Product not found for company'; end if;
 if v_archived is not null then raise exception 'Archived product cannot be adjusted'; end if;
 if v_unit not in ('ea','kg','m','pack','container') or v_unit is null then
   raise exception 'Unsupported product unit';
 end if;
 if v_unit in ('ea','pack','container') and p_quantity<>trunc(p_quantity) then
   raise exception 'Whole number required for this product';
 end if;
 select name into v_warehouse from public.warehouses
 where id=p_warehouse_id and company_id=v_company for update;
 if not found then raise exception 'Warehouse not found for company'; end if;
 select quantity into v_old from public.warehouse_stock
 where warehouse_id=p_warehouse_id and product_id=p_product_id for update;
 if not found then
   raise exception 'Opening stock not yet posted; use the one-time opening stocktake';
 end if;

 v_new:=case p_operation
   when 'add' then v_old+p_quantity
   when 'remove' then v_old-p_quantity
   else p_quantity end;
 if v_new < 0 then raise exception 'Insufficient warehouse stock'; end if;
 if v_new >= 1000000000 then raise exception 'Quantity exceeds supported range'; end if;
 v_delta:=v_new-v_old;
 if v_delta=0 then raise exception 'No stock change to record'; end if;

 update public.warehouse_stock set quantity=v_new,updated_at=now()
 where warehouse_id=p_warehouse_id and product_id=p_product_id;
 insert into public.activity_log
   (company_id,van_id,user_id,product_id,product_name,type,quantity,reference,notes)
 values
   (v_company,null,v_actor,p_product_id,v_product,'warehouse-adjust',abs(v_delta),
    btrim(p_reference),
    'Warehouse: '||v_warehouse||'. Operation: '||p_operation||
    '. Previous: '||v_old||' '||v_unit||'. New: '||v_new||' '||v_unit||
    '. Change: '||case when v_delta>0 then '+' else '' end||v_delta||' '||v_unit);
 return v_new;
end;
$function$

revoke all on function public.adjust_warehouse_stock(uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.adjust_warehouse_stock(uuid,uuid,text,numeric,text) to authenticated;
