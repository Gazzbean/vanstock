import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = new URL('../supabase/migrations/20261103040354_package_option_lifecycle_and_authorized_receiving.sql', import.meta.url)

const company = '00000000-0000-4000-8000-000000000001'
const user = '00000000-0000-4000-8000-000000000002'
const van3 = '00000000-0000-4000-8000-000000000003'
const van4 = '00000000-0000-4000-8000-000000000004'
const product = '00000000-0000-4000-8000-000000000005'
const supplier = '00000000-0000-4000-8000-000000000006'
const option = '00000000-0000-4000-8000-000000000007'
const receipt = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('isolated PostgreSQL receiving: conversion, idempotency, retiring and authorised vans', async t => {
  const db = new PGlite()
  try {
    // Only schema needed by the real receiving functions. No live Supabase connection.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''test.user_id'',true),'''')::uuid';
      create table public.profiles(id uuid primary key,company_id uuid,role text,van_id uuid,is_active boolean);
      create table public.user_access_capabilities(user_id uuid,company_id uuid,receive_stock boolean,office_access boolean);
      create table public.user_authorized_vans(user_id uuid,company_id uuid,van_id uuid);
      create table public.products(id uuid primary key,company_id uuid,stock_unit text,archived_at timestamptz);
      create table public.suppliers(id uuid primary key,company_id uuid,active boolean);
      create table public.supplier_product_options(
        id uuid primary key,company_id uuid,product_id uuid,supplier_id uuid,
        package_label text,purchase_unit text,units_per_package numeric
      );
      create table public.vans(id uuid primary key,company_id uuid);
      create table public.warehouses(id uuid primary key,company_id uuid);
      create table public.stock(
        van_id uuid,product_id uuid,quantity numeric,updated_at timestamptz,
        primary key(van_id,product_id)
      );
      create table public.warehouse_stock(
        warehouse_id uuid,product_id uuid,quantity numeric,updated_at timestamptz,
        primary key(warehouse_id,product_id)
      );
      create table public.pack_receipts(
        id uuid primary key,company_id uuid,supplier_option_id uuid,product_id uuid,
        supplier_id uuid,destination_type text,van_id uuid,warehouse_id uuid,
        packs numeric,units_per_package numeric,stock_quantity numeric,docket text,
        received_by uuid
      );
      create table public.loose_item_receipts(
        id uuid primary key,company_id uuid,product_id uuid,supplier_id uuid,
        destination_type text,van_id uuid,warehouse_id uuid,quantity numeric,
        docket text,received_by uuid
      );
    `)
    await db.query(`insert into profiles values ($1,$2,'technician',$3,true)`, [user, company, van3])
    await db.query(`insert into user_access_capabilities values ($1,$2,true,false)`, [user, company])
    await db.query(`insert into user_authorized_vans values ($1,$2,$3)`, [user, company, van3])
    await db.query(`insert into products values ($1,$2,'ea',null)`, [product, company])
    await db.query(`insert into suppliers values ($1,$2,true)`, [supplier, company])
    await db.query(`insert into supplier_product_options values ($1,$2,$3,$4,'500 pk','pack',500)`, [option, company, product, supplier])
    await db.query(`insert into vans values ($1,$2),($3,$2)`, [van3, company, van4])
    await db.query(`select set_config('test.user_id',$1,false)`, [user])
    await db.exec(await readFile(migration, 'utf8'))

    const post = (id, destination, packs = 1) => db.query(
      `select public.receive_supplier_pack($1,$2,$3,'TEST-DOCKET','van',$4) as quantity`,
      [id, option, packs, destination],
    )
    await t.test('one 500 pack credits 500 ea and preserves conversion snapshot', async () => {
      const result = await post(receipt(101), van3)
      assert.equal(Number(result.rows[0].quantity), 500)
      const balances = await db.query('select quantity from stock where van_id=$1', [van3])
      assert.equal(Number(balances.rows[0].quantity), 500)
      const saved = await db.query('select units_per_package,stock_quantity from pack_receipts where id=$1', [receipt(101)])
      assert.equal(Number(saved.rows[0].units_per_package), 500)
      assert.equal(Number(saved.rows[0].stock_quantity), 500)
    })
    await t.test('repeating the same receipt ID is idempotent', async () => {
      const result = await post(receipt(101), van3)
      assert.equal(Number(result.rows[0].quantity), 500)
      const balances = await db.query('select quantity from stock where van_id=$1', [van3])
      assert.equal(Number(balances.rows[0].quantity), 500)
    })
    await t.test('unauthorised van receives nothing', async () => {
      await assert.rejects(post(receipt(102), van4), /authorised van/)
      const rows = await db.query('select * from stock where van_id=$1', [van4])
      assert.equal(rows.rows.length, 0)
    })
    await t.test('fractional packs are rejected without a balance change', async () => {
      await assert.rejects(post(receipt(106), van3, 0.5), /Invalid supplier receipt/)
      const rows = await db.query('select quantity from stock where van_id=$1', [van3])
      assert.equal(Number(rows.rows[0].quantity), 500)
    })
    await t.test('authorised temporary van receives and records stock', async () => {
      await db.query('insert into user_authorized_vans values ($1,$2,$3)', [user, company, van4])
      const result = await post(receipt(103), van4)
      assert.equal(Number(result.rows[0].quantity), 500)
      const loose = await db.query(
        `select public.receive_loose_item($1,$2,$3,10,'LOOSE-DOCKET','van',$4) as quantity`,
        [receipt(104), product, supplier, van4],
      )
      assert.equal(Number(loose.rows[0].quantity), 10)
      const rows = await db.query('select quantity from stock where van_id=$1', [van4])
      assert.equal(Number(rows.rows[0].quantity), 510)
    })
    await t.test('retired package fails safely but historic receipts remain', async () => {
      await db.query('update supplier_product_options set active=false where id=$1', [option])
      await assert.rejects(post(receipt(105), van3), /Invalid active supplier package/)
      const rows = await db.query('select quantity from stock where van_id=$1', [van3])
      assert.equal(Number(rows.rows[0].quantity), 500)
      const saved = await db.query('select count(*)::int as count from pack_receipts where supplier_option_id=$1', [option])
      assert.equal(saved.rows[0].count, 2)
    })
    await t.test('inactive user cannot receive even with an authorised van', async () => {
      await db.query('update profiles set is_active=false where id=$1', [user])
      await assert.rejects(post(receipt(107), van3), /Not authorised/)
      const rows = await db.query('select quantity from stock where van_id=$1', [van3])
      assert.equal(Number(rows.rows[0].quantity), 500)
    })
  } finally {
    await db.close()
  }
})
