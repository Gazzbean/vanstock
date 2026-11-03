-- Vehicle metadata is separate from stock and immutable transaction history.
-- Draft migration: apply to a disposable/staging database before production.
ALTER TABLE public.vans
  ADD COLUMN IF NOT EXISTS registration text,
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS colour text,
  ADD COLUMN IF NOT EXISTS fuel_type text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS van_number_company_unique
  ON public.vans(company_id, lower(btrim(van_number)));
CREATE UNIQUE INDEX IF NOT EXISTS van_registration_company_unique
  ON public.vans(company_id, lower(btrim(registration)))
  WHERE registration IS NOT NULL AND btrim(registration) <> '';

ALTER TABLE public.vans ADD CONSTRAINT vans_fuel_type_valid
  CHECK (fuel_type IS NULL OR fuel_type IN ('diesel','petrol','hybrid','electric','lpg','other'));
ALTER TABLE public.vans ADD CONSTRAINT vans_vehicle_fields_limited
  CHECK (length(btrim(van_number)) BETWEEN 1 AND 40
    AND (registration IS NULL OR length(registration) <= 20)
    AND (make IS NULL OR length(make) <= 80)
    AND (model IS NULL OR length(model) <= 80)
    AND (colour IS NULL OR length(colour) <= 40));
