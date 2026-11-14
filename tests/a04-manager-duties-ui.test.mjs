import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('A04 separates Manager permissions across page, forms, action and RPC',async()=>{
 const panel=await readFile(new URL('../components/ManagerPermissionsPanel.tsx',import.meta.url),'utf8')
 const actions=await readFile(new URL('../lib/actions.ts',import.meta.url),'utf8')
 const wh=await readFile(new URL('../app/warehouse/page.tsx',import.meta.url),'utf8')
 const correction=await readFile(new URL('../components/WarehouseCorrections.tsx',import.meta.url),'utf8')
 assert.match(panel,/confirm_van_receipt:entry\?\.confirm_van_receipt/)
 assert.match(panel,/stocktake_warehouse:entry\?\.stocktake_warehouse/)
 assert.match(actions,/canReceiveRequests: admin \|\| Boolean\(grants\?\.confirm_van_receipt\)/)
 assert.match(actions,/canStocktake: admin \|\| Boolean\(grants\?\.stocktake_warehouse\)/)
 assert.match(actions,/p_confirm_van_receipt:grants\.confirm_van_receipt/)
 assert.match(actions,/p_stocktake_warehouse:grants\.stocktake_warehouse/)
 assert.match(wh,/rights\.canStocktake && <WarehouseOpeningStockForm/)
 assert.match(correction,/const allowed=operation==='set'\?canStocktake:canAdjust/)
});