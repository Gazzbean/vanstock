-- Already applied to VanStock production. Prevent same-name product duplicates within a company.
create unique index if not exists products_company_normalized_name_unique
on public.products (company_id, lower(btrim(name)));
