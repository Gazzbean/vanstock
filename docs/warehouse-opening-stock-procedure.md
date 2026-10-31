# VanStock — Opening warehouse stock procedure (draft, not commissioned)

**Purpose.** Establish a reliable opening warehouse inventory without changing existing van stock.

## Prerequisites
- Verify the VanStock public-schema backup and document that Supabase Auth users are not included.
- Confirm the correct company, warehouse and administrator/manager.
- Install and verify the permission and warehouse schema migrations in a TEST project first.
- Confirm product catalogue and units of measure. Current database uses integer quantities; **do not enter kg, metres or fractional stock into integer fields**.
- Do not infer warehouse stock from van quantities or invoice purchases; stock physically in a van remains in that van's inventory.

## Opening physical count
1. Select the physical Main Warehouse and an agreed stocktake cut-off date/time (Australia/Perth).
2. Count each product physically on the warehouse shelves, excluding stock already issued to vans.
3. Record product code, description, unit of measure, physical count, bin/shelf, count date, counted by and checked by. For refrigerant, aggregate the measured remaining kilograms by refrigerant type at each location; do not require cylinder-by-cylinder records.
4. Record unidentified products separately. Resolve duplicates, packaging units and product identities before posting.
5. Review exceptions and obtain manager/administrator approval; keep the signed source count.

## Staged posting implementation
- A new draft database function, `post_warehouse_opening_stock`, accepts an approved warehouse, product, counted quantity and stocktake reference.
- Only authenticated Administrator/Manager accounts can post, scoped to their company.
- Quantity, product unit and location are checked. Decimal kg and metres are permitted, while each/pack/container must be whole numbers.
- A unique `(warehouse_id, product_id)` opening-entry record prevents double posting, including for zero counts.
- The opening balance, entry record and activity log are written in one database transaction; errors roll back all three.
- An existing warehouse balance cannot be overwritten by an opening-stock posting.
- This is prepared SQL only; it has not been deployed or tested in a Supabase environment.

## Posting design
- Opening balances will be entered only through a future admin/manager stocktake workflow with explicit approval.
- Each post must validate company/warehouse/product, nonnegative quantity and a unique stocktake batch to prevent double posting.
- Existing warehouse balances must not be silently overwritten. Require explicit reconciliation and record old/new balance.
- Post balances and the audit trail in one database transaction and make the process retry-safe.
- Reconcile opening warehouse total by product against the physical count before enabling replenishment.
- No fictitious opening balances, and no automatic deduction from existing vans.

## Acceptance tests
- Duplicate count batch cannot be posted twice.
- A technician without permission cannot adjust or publish opening balances.
- Mixed product units are rejected until the unit-of-measure model is complete.
- An entry for a different company or nonexistent product is rejected.
- Failed/partial database operations leave previous balances intact.
- Main Warehouse and four vans reconcile to opening counts with no invented movements.

**Current status**: This document is guidance only. No stocktake posting endpoint or movement button is enabled. 
