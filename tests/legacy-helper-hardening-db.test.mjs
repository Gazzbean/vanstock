import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

test('legacy RLS helpers remain available to authenticated users but not anonymous clients',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table profiles(id uuid,company_id uuid,van_id uuid);
    create function public.my_company_id() returns uuid language sql stable security definer as
      'select company_id from public.profiles where id=auth.uid()';
    create function public.my_van_id() returns uuid language sql stable security definer as
      'select van_id from public.profiles where id=auth.uid()';
    create function public.vanstock_block_inactive_writes() returns trigger language plpgsql security definer as
      $fn$ begin return new; end; $fn$;`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261103084000_legacy_helper_security_hardening.sql',import.meta.url),'utf8'))
  await db.exec('set role authenticated')
  assert.equal((await db.query('select my_company_id() as company')).rows[0].company,null)
  await db.exec('reset role; set role anon')
  await assert.rejects(db.query('select my_company_id()'),/permission denied/)
  await db.exec('reset role')
 }finally{await db.close()}
})
