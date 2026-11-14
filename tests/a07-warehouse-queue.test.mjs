import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const company=uuid(101),foreignCompany=uuid(102),admin=uuid(1),tech=uuid(2),outsider=uuid(3)
const vanA=uuid(201),vanB=uuid(202),foreignVan=uuid(203)
const request=(n,status,requested_by=admin,van_id=vanA,company_id=company,createdAt=n)=>
 ({id:uuid(1000+n),status,requested_by,van_id,company_id,reference:`REQ-${n}`,
  created_at:new Date(Date.UTC(2026,0,1,0,0,0)+createdAt*60000).toISOString(),
  warehouse_id:uuid(300),product_id:uuid(400),quantity:1,reviewed_by:null,fulfilled_by:null,
  issued_by:null,received_by:null,reviewed_at:null,issued_at:null,received_at:null,fulfilled_at:null})

const load=(src,file,requireModule)=>{
 const module={exports:{}}
 vm.runInNewContext(ts.transpileModule(src,{fileName:file,compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,
 }}).outputText,{module,exports:module.exports,require:requireModule,console,process,Date,Map,Set,Promise},{filename:file})
 return module.exports
}
const paging=load(await readFile(new URL('../lib/warehouse-queue-paging.ts',import.meta.url),'utf8'),'paging.ts',()=>{throw Error('Unexpected dependency')})
class Query{
 constructor(db,table){this.db=db;this.table=table;this.filters=[];this.orders=[];this.cap=Infinity;this.start=0;this.end=null}
 select(){return this}
 eq(col,val){this.filters.push(row=>row[col]===val);return this}
 in(col,vals){this.filters.push(row=>vals.includes(row[col]));return this}
 is(col,val){this.filters.push(row=>row[col]===val);return this}
 not(col,operator,val){if(operator!=='is'||val!=='null')throw Error('Unexpected not operator');this.filters.push(row=>row[col]!==null);return this}
 order(col,{ascending=true}={}){this.orders.push({col,ascending});return this}
 limit(n){this.cap=n;return this}
 range(from,to){this.start=from;this.end=to;return this}
 maybeSingle(){return Promise.resolve(this.result(true))}
 result(single=false){
  let rows=(this.db.tables[this.table]??[]).filter(row=>this.filters.every(f=>f(row)))
  rows=[...rows].sort((a,b)=>{
   for(const {col,ascending} of this.orders){
    const av=String(a[col]??''),bv=String(b[col]??'')
    const n=av.localeCompare(bv)
    if(n!==0)return ascending?n:-n
   }
   return 0
  })
  rows=rows.slice(this.start,this.end===null?this.start+this.cap:Math.min(this.end+1,this.start+this.cap))
  return {data:single?(rows[0]??null):rows,error:null}
 }
 then(yes,no){return Promise.resolve(this.result()).then(yes,no)}
}

async function harness(tables,account){
 const db={tables,from(table){return new Query(this,table)}}
 const session={auth:{getUser:async()=>({data:{user:{id:account.id}},error:null})},
   rpc:async()=>({data:account,error:null})}
 const src=await readFile(new URL('../lib/actions.ts',import.meta.url),'utf8')
 const module=load(src,'actions.ts',id=>{
  if(id==='./warehouse-queue-paging')return paging
  if(id==='./supabase')return {createServerClient:()=>db,createSessionClient:async()=>session}
  if(id==='next/headers')return {cookies:()=>({get:()=>null})}
  if(id==='./working-van')return {resolveWorkingVanId:()=>vanA}
  return {}
 })
 return module
}
const data=()=>{
 const rows=[]
 // 140 closed newer than an old pending request; open must still be shown.
 for(let n=1;n<=140;n++)rows.push(request(n,'fulfilled'))
 for(let n=141;n<=305;n++)rows.push(request(n,n%2?'pending':'approved'))
 // 135 issued for an assigned van, not necessarily requested by the recipient.
 for(let n=306;n<=440;n++)rows.push(request(n,'issued',admin,vanA))
 const targeted=request(900,'fulfilled',admin,vanA,company,0)
 rows.push(targeted)
 const foreign=request(901,'issued',outsider,foreignVan,foreignCompany,900)
 rows.push(foreign)
 const t=[
 {id:admin,company_id:company,role:'admin',is_active:true,van_id:null},
 {id:tech,company_id:company,role:'technician',is_active:true,van_id:vanA},
 {id:outsider,company_id:foreignCompany,role:'technician',is_active:true,van_id:foreignVan}
 ]
 const notes=[
  {id:uuid(8001),request_id:targeted.id,user_id:tech,company_id:company,event_type:'fulfilled',
   created_at:new Date('2026-01-01').toISOString(),read_at:null,dismissed_at:null},
  {id:uuid(8002),request_id:foreign.id,user_id:outsider,company_id:foreignCompany,event_type:'issued',
   created_at:new Date('2026-01-01').toISOString(),read_at:null,dismissed_at:null}
 ]
 return {rows,targeted,foreign,tables:{
   warehouse_replenishment_requests:rows,
   warehouse_receipt_discrepancies:[],
   warehouse_notifications:notes,
   profiles:t,
   user_authorized_vans:[{user_id:tech,company_id:company,van_id:vanA}],
   vans:[{id:vanA,company_id:company,active:true,van_number:'Van A'}],
   user_access_capabilities:[{user_id:admin,company_id:company,office_access:true,technician_access:false},
    {user_id:tech,company_id:company,office_access:false,technician_access:true}],
   user_warehouse_permissions:[]
  }}
}

test('A07 pagination keeps every open item even with >100 newer closed records',async()=>{
 const {tables}=data()
 const actions=await harness(tables,tables.profiles[0])
 const found=await actions.getWarehouseRequests()
 assert.equal(found.filter(r=>['pending','approved','issued'].includes(r.status)).length,300)
 assert.equal(found.filter(r=>['fulfilled','rejected'].includes(r.status)).length,100)
 assert.equal(found.length,400)
 assert.ok(found.some(r=>r.id===uuid(1141)),'old open request is retained')
 assert.equal(found.some(r=>r.company_id===foreignCompany),false)
})

test('A07 older completed notification-linked request is resolved only to authorised recipient',async()=>{
 const {tables,targeted,foreign}=data()
 const actions=await harness(tables,tables.profiles[1])
 const normal=await actions.getWarehouseRequests()
 assert.equal(normal.some(r=>r.id===targeted.id),false)
 const focused=await actions.getWarehouseRequests(targeted.id)
 assert.equal(focused.filter(r=>r.id===targeted.id).length,1)
 assert.ok(focused.some(r=>r.status==='issued'&&r.van_id===vanA))
 const unrelated=await actions.getWarehouseRequests(foreign.id)
 assert.equal(unrelated.some(r=>r.id===foreign.id),false)
 // A valid van assignment without a recipient's own notification is insufficient
 const another=request(920,'fulfilled',admin,vanA,company,0)
 tables.warehouse_replenishment_requests.push(another)
 const denied=await actions.getWarehouseRequests(another.id)
 assert.equal(denied.some(r=>r.id===another.id),false)
})

test('A07 own old history can be opened; invalid IDs and cross-company lookups do not leak',async()=>{
 const {tables}=data()
 const mine=request(930,'rejected',tech,vanA,company,0)
 tables.warehouse_replenishment_requests.push(mine)
 const actions=await harness(tables,tables.profiles[1])
 assert.equal((await actions.getWarehouseRequests(mine.id)).some(r=>r.id===mine.id),true)
 assert.equal((await actions.getWarehouseRequests('not-a-uuid')).some(r=>r.id==='not-a-uuid'),false)
})

test('A07 active notifications are not displaced by hundreds of dismissed history rows',async()=>{
 const {tables}=data()
 const live=tables.warehouse_notifications[0]
 const records=[live]
 for(let n=1;n<=125;n++){
   const req=request(1000+n,'fulfilled',admin,vanA,company,n+1000)
   tables.warehouse_replenishment_requests.push(req)
   records.push({id:uuid(9000+n),company_id:company,user_id:tech,request_id:req.id,
      event_type:'fulfilled',created_at:req.created_at,read_at:req.created_at,dismissed_at:req.created_at})
 }
 tables.warehouse_notifications=records
 const actions=await harness(tables,tables.profiles[1])
 const notifications=await actions.getMyWarehouseNotifications()
 assert.equal(notifications.filter(n=>!n.dismissed_at).length,1)
 assert.equal(notifications.filter(n=>n.dismissed_at).length,100)
 assert.ok(notifications.some(n=>n.id===live.id))
 assert.equal(tables.warehouse_notifications.length,126,'all dismissal history remains in the database')
})

test('A07 page loader does not stop at 100 or silently ignore a paged read error',async()=>{
 const records=Array.from({length:605},(_,i)=>({id:String(i)}))
 const result=await paging.readAllWarehousePages(async(from,to)=>({data:records.slice(from,to+1),error:null}),200)
 assert.equal(result.data.length,605)
 const failed=await paging.readAllWarehousePages(async(from)=>from>=200
   ?{data:null,error:{message:'service unavailable',code:'NET'}}
   :{data:records.slice(from,from+200),error:null},200)
 assert.equal(failed.error.code,'NET')
 assert.equal(failed.data,null)
})
