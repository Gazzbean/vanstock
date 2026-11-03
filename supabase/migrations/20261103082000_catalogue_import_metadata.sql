-- Transactional product + optional classification import. No stock movements.
CREATE TABLE IF NOT EXISTS public.product_import_supplier_hints (
  product_id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  supplier_name text NOT NULL CHECK (length(btrim(supplier_name)) BETWEEN 1 AND 120),
  supplier_part_number text CHECK (supplier_part_number IS NULL OR length(supplier_part_number)<=120),
  FOREIGN KEY(product_id,company_id) REFERENCES public.products(id,company_id) ON DELETE CASCADE
);
ALTER TABLE public.product_import_supplier_hints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_import_supplier_hints FROM anon;
GRANT SELECT ON public.product_import_supplier_hints TO authenticated;
CREATE POLICY "supplier hints company read" ON public.product_import_supplier_hints FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=product_import_supplier_hints.company_id));

CREATE OR REPLACE FUNCTION public.vanstock_import_catalogue_metadata(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_item jsonb;
  v_id uuid;
  v_count integer := 0;
  v_unit text;
  v_min numeric;
  v_tracking text;
  v_sm8_code text;
  v_sm8_uuid text;
  v_name text;
  v_category text;
  v_supplier text;
  v_supplier_part text;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR v_actor.role NOT IN ('admin','manager') OR v_actor.company_id IS NULL OR v_actor.is_active IS FALSE THEN
    RAISE EXCEPTION 'Manager access required';
  END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Import between 1 and 200 products';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_name := btrim(v_item->>'name');v_category := btrim(v_item->>'category');
    v_unit := v_item->>'stock_unit';v_tracking:=COALESCE(NULLIF(v_item->>'tracking_type',''),'stocked');
    v_sm8_code:=nullif(btrim(v_item->>'servicem8_item_number'),'');
    v_sm8_uuid:=nullif(btrim(v_item->>'servicem8_material_uuid'),'');
    v_supplier:=nullif(btrim(v_item->>'supplier_name'),'');
    v_supplier_part:=nullif(btrim(v_item->>'supplier_part_number'),'');
    IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200 OR v_category IS NULL OR length(v_category) NOT BETWEEN 1 AND 100
      OR v_unit NOT IN ('ea','kg','m','pack','container')
      OR v_tracking NOT IN ('stocked','bulk_consumable','cylinder','kit','reference_only','billing_only')
      OR length(coalesce(v_sm8_code,''))>120 OR length(coalesce(v_sm8_uuid,''))>120
      OR length(coalesce(v_supplier,''))>120 OR length(coalesce(v_supplier_part,''))>120
      OR (v_supplier_part IS NOT NULL AND v_supplier IS NULL)
      OR (v_item->>'min_stock') !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Invalid product metadata';
    END IF;
    v_min:=(v_item->>'min_stock')::numeric;
    IF v_min >= 1000000000 OR (v_unit NOT IN ('kg','m') AND v_min<>trunc(v_min)) THEN
      RAISE EXCEPTION 'Invalid minimum quantity';
    END IF;
    IF EXISTS(SELECT 1 FROM public.products p WHERE p.company_id=v_actor.company_id AND lower(btrim(p.name))=lower(v_name)) THEN
      RAISE EXCEPTION 'Product already exists: %',v_name;
    END IF;
    INSERT INTO public.products(company_id,name,category,stock_unit,min_stock)
      VALUES(v_actor.company_id,v_name,v_category,v_unit,v_min) RETURNING id INTO v_id;
    INSERT INTO public.product_settings(product_id,company_id,tracking_type,servicem8_item_number,servicem8_material_uuid,mapping_status)
      VALUES(v_id,v_actor.company_id,v_tracking,v_sm8_code,v_sm8_uuid,
        CASE WHEN v_sm8_code IS NOT NULL OR v_sm8_uuid IS NOT NULL THEN 'needs_review' ELSE 'unlinked' END);
    IF v_supplier IS NOT NULL THEN
      INSERT INTO public.product_import_supplier_hints(product_id,company_id,supplier_name,supplier_part_number)
        VALUES(v_id,v_actor.company_id,v_supplier,v_supplier_part);
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.vanstock_import_catalogue_metadata(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vanstock_import_catalogue_metadata(jsonb) TO authenticated;
