import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('Manager permission UI excludes user_id from submitted grants',async()=>{
 const source=await readFile(new URL('../components/ManagerPermissionsPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/function cleanGrants/);
 assert.match(source,/useState<Grants>\(\(\)=>cleanGrants\(initialGrants\.find/);
 assert.match(source,/setDraft\(cleanGrants\(rows\.find/);
 assert.match(source,/saveManagerOperationPermissions\(selected,cleanGrants\(draft\)\)/);
 assert.doesNotMatch(source,/\.\.\.initialGrants\.find/);
});