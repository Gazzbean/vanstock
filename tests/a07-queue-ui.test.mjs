import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHarness,byId,textOf} from './helpers/component-interaction-harness.mjs'

test('A07 completed notification target automatically opens history and highlights the request',async()=>{
 const h=await createHarness('components/WarehouseRequestQueue.tsx',{})
 const row={id:'old',warehouse_id:'w',van_id:'v',product_id:'p',quantity:1,
 reference:'OLD-001',status:'fulfilled',created_at:'2026-01-01T00:00:00Z',
 requested_by_label:'Person',reviewed_by_label:'Person',reviewed_at:null,
 rejection_reason:null,fulfilled_by_label:'Person',issued_by_label:'Person',
 received_by_label:'Person',discrepancy:null}
 const props={requests:[row],focusRequestId:'old',
  warehouses:[{id:'w',name:'Warehouse'}],vans:[{id:'v',van_number:'Van'}],
  products:[{id:'p',name:'Part',unit:'ea'}],canManage:true,canIssue:true,
  canApprove:true,canReceive:true,writesEnabled:true}
 const rendered=h.render(props)
 assert.equal(byId(rendered,'warehouse-request-filter').props.value,'all')
 assert.match(textOf(rendered),/OLD-001/)
 const all=await readFile(new URL('../components/WarehouseRequestQueue.tsx',import.meta.url),'utf8')
 assert.match(all,/warehouse-request-mobile-\$\{id\}/)
 assert.match(all,/scrollIntoView\(\{block:'center'\}\)/)
})
test('A07 links and notification history use an explicit authorised request parameter',async()=>{
 const files=await Promise.all(['components/SidebarNav.tsx','app/actions/page.tsx',
   'app/warehouse/page.tsx','app/stock/page.tsx','lib/actions.ts'].map(x=>
   readFile(new URL('../'+x,import.meta.url),'utf8')))
 assert.match(files[0],/notificationHref\(n.request_id\)/)
 assert.match(files[0],/\?request=\$\{encodeURIComponent\(id\)\}/)
 assert.match(files[0],/Show more notifications/)
 assert.match(files[1],/\?request=\$\{encodeURIComponent\(r.id\)\}/)
 assert.match(files[2],/getWarehouseRequests\(searchParams\?\.request\)/)
 assert.match(files[3],/getWarehouseRequests\(searchParams\?\.request\)/)
 assert.match(files[4],/eq\('user_id',profile.id\)\.eq\('request_id',row.id\)/)
})
