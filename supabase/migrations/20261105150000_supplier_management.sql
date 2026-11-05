-- Controlled supplier/package maintenance; historical receipts remain immutable.
begin;

create table if not exists public.supplier_configuration_audit (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 actor_id uuid references public.profiles(id),
 entity_type text not null check (entity_type in ('supplier','package')),
 entity_id uuid not null,
 action text not null check (action in ('updated','deleted')),
 before_values jsonb,
 after_values jsonb,
 created_at timestamptz not null default now()
);
alter table public.supplier_configuration_audit enable row level security;
revoke all on public.supplier_configuration_audit from public,anon,authenticated;

create or replace function public.vanstock_audit_supplier_config()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.supplier_configuration_audit
  (company_id,actor_id,entity_type,entity_id,action,before_values,after_values)
 values (OLD.company_id,auth.uid(),case when TG_TABLE_NAME='suppliers' then 'supplier' else 'package' end,
  OLD.id,case when TG_OP='DELETE' then 'deleted' else 'updated' end,
  to_jsonb(OLD),case when TG_OP='DELETE' then null else to_jsonb(NEW) end);
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end;
$$;
revoke all on function public.vanstock_audit_supplier_config() from public,anon,authenticated;
drop trigger if exists audit_supplier_changes on public.suppliers;
create trigger audit_supplier_changes after update or delete on public.suppliers
for each row execute function public.vanstock_audit_supplier_config();
drop trigger if exists audit_package_changes on public.supplier_product_options;
create trigger audit_package_changes after update or delete on public.supplier_product_options
for each row execute function public.vanstock_audit_supplier_config();

create or replace function public.vanstock_delete_unused_supplier_record(p_kind text,p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_company uuid; v_role text;
begin
 select company_id,role into v_company,v_role from public.profiles where id=v_actor and is_active=true;
 if v_company is null or v_role not in ('admin','manager') then
  raise exception 'Manager access required';
 end if;
 if p_kind='package' then
  perform 1 from public.supplier_product_options where id=p_id and company_id=v_company for update;
  if not found then raise exception 'Purchase option not found'; end if;
  if exists(select 1 from public.pack_receipts where supplier_option_id=p_id) then
   raise exception 'Package has historical receipts; retire it instead';
  end if;
  delete from public.supplier_product_options where id=p_id and company_id=v_company;
 elsif p_kind='supplier' then
  perform 1 from public.suppliers where id=p_id and company_id=v_company for update;
  if not found then raise exception 'Supplier not found'; end if;
  if exists(select 1 from public.supplier_product_options where supplier_id=p_id)
    or exists(select 1 from public.pack_receipts where supplier_id=p_id)
    or exists(select 1 from public.loose_item_receipts where supplier_id=p_id) then
   raise exception 'Supplier has linked packages or receipts; deactivate it instead';
  end if;
  delete from public.suppliers where id=p_id and company_id=v_company;
 else
  raise exception 'Invalid record type';
 end if;
 return true;
exception when foreign_key_violation then
 raise exception 'Record is referenced elsewhere; deactivate or retire it instead';
end;
$$;
revoke all on function public.vanstock_delete_unused_supplier_record(text,uuid) from public,anon;
grant execute on function public.vanstock_delete_unused_supplier_record(text,uuid) to authenticated;
commit;
