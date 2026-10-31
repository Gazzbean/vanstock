-- Phase 1A migration: applied to Supabase as vanstock_phase1a_catalogue_settings_consumables.
-- Additive product metadata and six approved consumables presets. No stock changes.
CREATE UNIQUE INDEX IF NOT EXISTS products_id_company_unique ON public.products(id,company_id);
CREATE TABLE IF NOT EXISTS public.product_settings (
 product_id uuid PRIMARY KEY,
 company_id uuid NOT NULL,
 tracking_type text NOT NULL DEFAULT 'stocked' CHECK(tracking_type IN ('stocked','bulk_consumable','cylinder','kit','reference_only','billing_only')),
 servicem8_material_uuid text,
 servicem8_item_number text,
 mapping_status text NOT NULL DEFAULT 'unlinked' CHECK(mapping_status IN ('unlinked','linked','needs_review','vanstock_only')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(product_id,company_id) REFERENCES public.products(id,company_id) ON DELETE RESTRICT,
 CONSTRAINT linked_requires_uuid CHECK(mapping_status<>'linked' OR nullif(btrim(servicem8_material_uuid),'') IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_settings_company_sm8_uuid_unique ON public.product_settings(company_id,servicem8_material_uuid) WHERE servicem8_material_uuid IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.consumables_groups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 unit text NOT NULL CHECK(unit IN('ea','m','kg','pack','container')),
 quick_1 numeric(14,2) NOT NULL CHECK(quick_1>0),
 quick_2 numeric(14,2) NOT NULL CHECK(quick_2>quick_1),
 quick_3 numeric(14,2) NOT NULL CHECK(quick_3>quick_2),
 quick_4 numeric(14,2) NOT NULL CHECK(quick_4>quick_3),
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS consumables_groups_company_name_unique ON public.consumables_groups(company_id,lower(btrim(name)));
ALTER TABLE public.product_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumables_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_settings FROM anon;
REVOKE ALL ON public.consumables_groups FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.product_settings TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.consumables_groups TO authenticated;
CREATE POLICY "settings read company" ON public.product_settings FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=product_settings.company_id));
CREATE POLICY "settings insert manager" ON public.product_settings FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=product_settings.company_id AND p.role IN('admin','manager')));
CREATE POLICY "settings update manager" ON public.product_settings FOR UPDATE TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=product_settings.company_id AND p.role IN('admin','manager')))
 WITH CHECK(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=product_settings.company_id AND p.role IN('admin','manager')));
CREATE POLICY "groups read company" ON public.consumables_groups FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=consumables_groups.company_id));
CREATE POLICY "groups insert manager" ON public.consumables_groups FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=consumables_groups.company_id AND p.role IN('admin','manager')));
CREATE POLICY "groups update manager" ON public.consumables_groups FOR UPDATE TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=consumables_groups.company_id AND p.role IN('admin','manager')))
 WITH CHECK(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.company_id=consumables_groups.company_id AND p.role IN('admin','manager')));
INSERT INTO public.consumables_groups(company_id,name,unit,quick_1,quick_2,quick_3,quick_4)
 SELECT c.id,d.name,d.unit,d.q1,d.q2,d.q3,d.q4 FROM public.companies c
 CROSS JOIN (VALUES
 ('Cable ties','ea',5,10,20,50),('Screws','ea',1,5,10,25),
 ('Crimp terminals','ea',1,5,10,20),('Rivets','ea',1,5,10,25),
 ('Cable','m',1,2,5,10),('Insulation tape','ea',1,2,3,5)
 ) AS d(name,unit,q1,q2,q3,q4) ON CONFLICT DO NOTHING;
