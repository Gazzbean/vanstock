-- Working-van selection is a navigation event, never a stock movement.
CREATE TABLE IF NOT EXISTS public.working_van_selection_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 previous_van_id uuid REFERENCES public.vans(id),
 selected_van_id uuid REFERENCES public.vans(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT van_selection_changed CHECK (previous_van_id IS DISTINCT FROM selected_van_id)
);
CREATE INDEX IF NOT EXISTS working_van_events_company_time ON public.working_van_selection_events(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS working_van_events_user_time ON public.working_van_selection_events(user_id,created_at DESC);
ALTER TABLE public.working_van_selection_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.working_van_selection_events FROM anon;
GRANT SELECT ON public.working_van_selection_events TO authenticated;
CREATE POLICY "working van change history own or office" ON public.working_van_selection_events
 FOR SELECT TO authenticated USING (
  user_id=(SELECT auth.uid()) OR EXISTS (
   SELECT 1 FROM public.profiles p LEFT JOIN public.user_access_capabilities c
    ON c.user_id=p.id AND c.company_id=p.company_id
   WHERE p.id=(SELECT auth.uid()) AND p.company_id=working_van_selection_events.company_id
     AND p.is_active AND (p.role='admin' OR c.office_access)
  )
 );

-- No INSERT/UPDATE/DELETE grant or policy exists for authenticated clients.
-- The authenticated server action verifies van authorisation and the prior
-- HTTP-only working-van cookie, then writes via the server-only service role.
