import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('Manager warehouse grants control sidebar and page access independently from Office',async()=>{
 const nav=await readFile(new URL('../components/SidebarNav.tsx',import.meta.url),'utf8');
 const warehouse=await readFile(new URL('../app/warehouse/page.tsx',import.meta.url),'utf8');
 const actions=await readFile(new URL('../lib/actions.ts',import.meta.url),'utf8');
 assert.match(nav,/role === 'manager' \? 'Manager'/);
 assert.match(nav,/manager_operations\?\.warehouse_access/);
 assert.match(warehouse,/manager_operations\?\.warehouse_access/);
 assert.match(actions,/warehouse_access:Boolean\(managerRights\?\.canManageRequests/);
 assert.match(actions,/!access\.office_access && !rights\.canManageRequests/);
});