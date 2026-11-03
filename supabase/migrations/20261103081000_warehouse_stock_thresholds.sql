-- Independent warehouse reorder thresholds; never use products.min_stock for warehouses.
CREATE TABLE IF NOT EXISTS public.warehouse_stock_standards (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  min_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  target_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (target_quantity >= min_quantity),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id,product_id)
);
CREATE INDEX IF NOT EXISTS warehouse_stock_standards_company_idx ON public.warehouse_stock_standards(company_id);
ALTER TABLE public.warehouse_stock_standards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_stock_standards FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.warehouse_stock_standards TO authenticated;
CREATE POLICY "warehouse standards company read" ON public.warehouse_stock_standards FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=warehouse_stock_standards.company_id));
CREATE POLICY "warehouse standards manager insert" ON public.warehouse_stock_standards FOR INSERT TO authenticated
 WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=warehouse_stock_standards.company_id AND p.role IN ('admin','manager'))
   AND EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id=warehouse_id AND w.company_id=company_id)
   AND EXISTS (SELECT 1 FROM public.products x WHERE x.id=product_id AND x.company_id=company_id));
CREATE POLICY "warehouse standards manager update" ON public.warehouse_stock_standards FOR UPDATE TO authenticated
 USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=warehouse_stock_standards.company_id AND p.role IN ('admin','manager')))
 WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=warehouse_stock_standards.company_id AND p.role IN ('admin','manager'))
   AND EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id=warehouse_id AND w.company_id=company_id)
   AND EXISTS (SELECT 1 FROM public.products x WHERE x.id=product_id AND x.company_id=company_id));
