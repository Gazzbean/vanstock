import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const migration=await readFile(new URL('../supabase/migrations/20261114050000_a02_access_boundary_hardening.sql',import.meta.url),'utf8');
test('A02 denies direct anonymous and authenticated client DML on sensitive tables',()=>{
 assert.match(migration,/revoke all on table[\s\S]+from anon,authenticated;/);
 assert.match(migration,/grant select on table[\s\S]+to authenticated;/);
 assert.match(migration,/drop policy if exists "vans company" on public\.vans/);
 assert.match(migration,/drop policy if exists "products write manager" on public\.products/);
 assert.match(migration,/drop policy if exists "stock write own van" on public\.stock/);
});
test('A02 stock and history reads require active identity and authorised van or Office scope',()=>{
 assert.match(migration,/p\.is_active is true/g);
 assert.match(migration,/c\.office_access/);
 assert.match(migration,/c\.technician_access/);
 assert.match(migration,/public\.user_authorized_vans/);
 assert.match(migration,/create policy "stock read authorised"/);
 assert.match(migration,/create policy "log read authorised"/);
});
test('A02 inactive accounts are denied company helper access',()=>{
 assert.match(migration,/create or replace function public\.my_company_id\(\)/);
 assert.match(migration,/create or replace function public\.my_van_id\(\)/);
 assert.equal((migration.match(/p\.is_active is true/g)||[]).length>=4,true);
});
