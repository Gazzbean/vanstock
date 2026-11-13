import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('Manager assignment is wired through account and invitation UI',async()=>{
 const user=await readFile(new URL('../components/UsersAccessPanel.tsx',import.meta.url),'utf8');
 const invite=await readFile(new URL('../components/AddUserInvite.tsx',import.meta.url),'utf8');
 const actions=await readFile(new URL('../lib/actions.ts',import.meta.url),'utf8');
 assert.match(user,/Base role/);assert.match(user,/value="manager"/);assert.match(user,/saveUserBaseRole/);
 assert.match(invite,/value="manager"/);assert.match(actions,/configure_user_base_role/);
 assert.match(actions,/vanstock_setup_invited_user_with_role/);
});