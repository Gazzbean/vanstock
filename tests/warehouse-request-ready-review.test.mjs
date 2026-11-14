import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('Warehouse replenishment shows amber ready-to-submit review when all details are valid',async()=>{
 const source=await readFile(new URL('../components/WarehouseRequestForm.tsx',import.meta.url),'utf8');
 assert.match(source,/transactionBorder\(completed\?'success':error\?'error':pending\?'pending':shortage\|\|ready\?'ready':'idle'\)/);
 assert.match(source,/ready&&!message&&!error/);
 assert.match(source,/Ready to submit — review replenishment request/);
 assert.match(source,/No stock will move yet/);
 assert.match(source,/if\(!ready\|\|pending\|\|completed\)return/);
});