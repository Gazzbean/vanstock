-- Job materials are either consumed immediately or allocated to a site.
-- Both paths debit van stock exactly once; closing an allocation as used
-- never debits it again. All writes require authenticated, authorised RPCs.
create table public.job_material_allocations (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 van_id uuid not null references public.vans(id),
 product_id uuid not null references public.products(id),
 allocated_by uuid not null references public.profiles(id),
 job_reference text not null,
 site_location text not null,
 reason text not null,
 quantity numeric(12,2) not null check (quantity>0),
 status text not null default 'on_site' check (status in ('on_site','used','returned')),
 resolved_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 constraint job_allocation_location_not_empty check (length(btrim(site_location)) between 3 and 500),
 constraint job_allocation_reason_not_empty check (length(btrim(reason)) between 3 and 1000),
 constraint job_allocation_reference_not_empty check (length(btrim(job_reference)) between 1 and 120)
);
create index job_allocations_company_status on public.job_material_allocations(company_id,status,created_at desc);
create index job_allocations_job on public.job_material_allocations(company_id,job_reference);
alter table public.job_material_allocations enable row level security;
revoke all on public.job_material_allocations from public,anon,authenticated;

-- One transaction for a technician's entire job entry.
-- This delegates balance checks, unit precision and historical issue logging
-- to the existing authorised six-argument stock RPC.
create function public.record_job_materials(
 p_van_id uuid,p_job_reference text,p_items jsonb,p_mode text,
 p_site_location text default null,p_reason text default null
)
returns integer language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid(); v_company uuid; v_row jsonb;
 v_product uuid; v_qty numeric; v_n integer := 0;
begin
 select company_id into v_company from public.profiles where id=v_uid and is_active=true;
 if v_company is null or not exists(select 1 from public.user_access_capabilities
  where user_id=v_uid and company_id=v_company and technician_access=true) then
  raise exception 'Technician access required'; end if;
 if not exists(select 1 from public.user_authorized_vans a join public.vans v on v.id=a.van_id
  where a.user_id=v_uid and a.company_id=v_company and a.van_id=p_van_id and v.active) then
  raise exception 'Van not authorised'; end if;
 if p_mode not in ('used','allocated') or length(btrim(coalesce(p_job_reference,''))) not between 1 and 120
  or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50
  then raise exception 'Invalid job entry'; end if;
 if p_mode='allocated' and (length(btrim(coalesce(p_site_location,''))) not between 3 and 500
  or length(btrim(coalesce(p_reason,''))) not between 3 and 1000) then
  raise exception 'Site location and reason are required'; end if;
 for v_row in select value from jsonb_array_elements(p_items) as value loop
  if v_row->>'product_id' is null or v_row->>'quantity' is null then
   raise exception 'Product and quantity required'; end if;
  v_product:=(v_row->>'product_id')::uuid;
  v_qty:=(v_row->>'quantity')::numeric;
  if v_qty<=0 or v_qty>=1000000000 or v_qty<>trunc(v_qty,2) then
   raise exception 'Invalid material quantity'; end if;
  perform public.apply_van_stock_action(v_product,'issue',v_qty,btrim(p_job_reference),
   case when p_mode='allocated' then 'Allocated on site: '||btrim(p_site_location)||'. Reason: '||btrim(p_reason)
    else 'Materials used on job' end,p_van_id);
  if p_mode='allocated' then
   insert into public.job_material_allocations(company_id,van_id,product_id,allocated_by,
    job_reference,site_location,reason,quantity)
   values(v_company,p_van_id,v_product,v_uid,btrim(p_job_reference),
    btrim(p_site_location),btrim(p_reason),v_qty);
  end if;
  v_n:=v_n+1;
 end loop;
 return v_n;
end; $$;

create function public.resolve_job_material_allocation(p_allocation_id uuid,p_resolution text)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid(); v_company uuid; v_row public.job_material_allocations%rowtype;
begin
 select company_id into v_company from public.profiles where id=v_uid and is_active=true;
 if v_company is null or p_resolution not in ('used','returned') then raise exception 'Invalid resolution'; end if;
 select * into v_row from public.job_material_allocations
  where id=p_allocation_id and company_id=v_company for update;
 if not found or v_row.status<>'on_site' then raise exception 'Allocation not open'; end if;
 if not exists(select 1 from public.user_access_capabilities c
  where c.user_id=v_uid and c.company_id=v_company and
   (c.office_access or (c.technician_access and exists(
    select 1 from public.user_authorized_vans a where a.user_id=v_uid
     and a.company_id=v_company and a.van_id=v_row.van_id)))) then
  raise exception 'Not authorised'; end if;
 if p_resolution='returned' then
  if not exists(select 1 from public.user_access_capabilities c join public.user_authorized_vans a
   on a.user_id=c.user_id and a.company_id=c.company_id
   where c.user_id=v_uid and c.company_id=v_company and c.technician_access=true
    and a.van_id=v_row.van_id) then raise exception 'Return requires authorised technician'; end if;
  perform public.apply_van_stock_action(v_row.product_id,'return',v_row.quantity,
   v_row.job_reference,'Returned unused allocated materials from '||v_row.site_location,v_row.van_id);
 end if;
 update public.job_material_allocations set status=p_resolution,resolved_by=v_uid,resolved_at=now()
  where id=p_allocation_id;
end; $$;

revoke all on function public.record_job_materials(uuid,text,jsonb,text,text,text) from public,anon;
grant execute on function public.record_job_materials(uuid,text,jsonb,text,text,text) to authenticated;
revoke all on function public.resolve_job_material_allocation(uuid,text) from public,anon;
grant execute on function public.resolve_job_material_allocation(uuid,text) to authenticated;
