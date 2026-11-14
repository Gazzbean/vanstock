import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import vm from 'node:vm'
import {createHarness,nodes,textOf,button,deferred} from './helpers/component-interaction-harness.mjs'

const products=[{id:'item1',name:'Cable ties',stock_unit:'ea'}]
const vanStock=[{product_id:'item1',quantity:25}]
const base={products,stockItems:vanStock,selectedVanId:'van1',selectedVanNumber:'Van 1',
 consumables:{groups:[],assignments:[]},allocations:[]}

function enter(tree,{job='SM8-123',product='item1',quantity='2'}={}){
 const fields=nodes(tree)
 const jobField=fields.find(x=>x.type==='input'&&x.props.placeholder==='Exact ServiceM8 job number')
 const itemSelect=fields.find(x=>x.type==='select'&&x.props.value==='')
 const qtyInput=fields.find(x=>x.type==='input'&&x.props.type==='number')
 assert.ok(jobField&&itemSelect&&qtyInput)
 jobField.props.onChange({target:{value:job}})
 itemSelect.props.onChange({target:{value:product}})
 qtyInput.props.onChange({target:{value:quantity}})
}

test('A09 materials require explicit material selection, show VanStock-only scope, and block fast double submit',async()=>{
 const saved=deferred()
 let calls=0
 const h=await createHarness('components/TransferForm.tsx',{
  recordJobMaterials:async p=>{calls++;assert.equal(p.jobReference,'SM8-123');assert.equal(p.mode,'used');return saved.promise}
 })
 let tree=h.render(base)
 assert.equal(button(tree,'Record Materials Used').props.disabled,true)
 assert.match(textOf(tree),/does not add items to the ServiceM8 job or invoice/)
 enter(tree)
 tree=h.render(base)
 assert.match(tree.props.children[0].props.className,/border-amber-500/)
 assert.match(textOf(tree),/Ready to confirm — review VanStock deduction/)
 const submit=button(tree,'Record Materials Used')
 submit.props.onClick();submit.props.onClick()
 await Promise.resolve()
 assert.equal(calls,1)
 saved.resolve({success:true})
 await h.flush()
 tree=h.render(base)
 assert.match(tree.props.children[0].props.className,/border-green-600/)
 assert.match(textOf(tree),/Office must check the ServiceM8 job billing/)
 assert.equal(button(tree,'Recorded in VanStock').props.disabled,true)
 assert.equal(h.refreshCount,1)
})

test('A09 a failed material issue is red and an edited attempt can be retried once',async()=>{
 let calls=0
 const h=await createHarness('components/TransferForm.tsx',{
  recordJobMaterials:async()=>++calls===1?{error:'Insufficient van stock'}:{success:true},
 })
 let tree=h.render(base);enter(tree)
 tree=h.render(base);button(tree,'Record Materials Used').props.onClick()
 await h.flush();tree=h.render(base)
 assert.match(tree.props.children[0].props.className,/border-red-500/)
 assert.match(textOf(tree),/Insufficient van stock/)
 const qty=nodes(tree).find(x=>x.type==='input'&&x.props.type==='number')
 qty.props.onChange({target:{value:'1'}})
 tree=h.render(base)
 assert.match(tree.props.children[0].props.className,/border-amber-500/)
 button(tree,'Record Materials Used').props.onClick()
 await h.flush()
 assert.equal(calls,2)
 assert.match(h.render(base).props.children[0].props.className,/border-green-600/)
})

test('A09 resolving one on-site allocation cannot perform duplicate state or stock changes',async()=>{
 let calls=0
 const outcome=deferred()
 const allocated={...base,allocations:[{
  id:'allocation1',van_id:'van1',product_id:'item1',quantity:2,
  job_reference:'SM8-123',site_location:'Plant room',reason:'Waiting for shutdown',
  created_at:'2026-11-14T01:00:00Z',status:'on_site',
 }]}
 const h=await createHarness('components/TransferForm.tsx',{
  resolveJobMaterialAllocation:async(id,how)=>{calls++;assert.equal(id,'allocation1');assert.equal(how,'used');return outcome.promise}
 })
 let tree=h.render(allocated)
 const used=button(tree,'Mark as Used')
 used.props.onClick();used.props.onClick()
 await Promise.resolve()
 assert.equal(calls,1)
 outcome.resolve({success:true});await h.flush()
 tree=h.render(allocated)
 assert.equal(button(tree,'Mark as Used').props.disabled,true)
 assert.equal(button(tree,'Return to Van').props.disabled,true)
 assert.match(textOf(tree),/No second van deduction/)
})

class Query{
 constructor(db,name){this.db=db;this.name=name;this.filters=[];this.orders=[];this.from=0;this.to=null}
 select(){return this}
 eq(k,v){this.filters.push(x=>x[k]===v);return this}
 order(k,{ascending=true}={}){this.orders.push([k,ascending]);return this}
 range(from,to){this.from=from;this.to=to;return this}
 then(done,failed){let rows=this.db[this.name].filter(x=>this.filters.every(fn=>fn(x)))
  rows=rows.sort((a,b)=>{for(const [col,asc] of this.orders){const d=String(a[col]??'').localeCompare(String(b[col]??''));if(d)return asc?d:-d}return 0})
  return Promise.resolve({data:rows.slice(this.from,this.to+1),error:null}).then(done,failed)}
}

test('A09 435 unresolved allocations remain visible, respecting company and Working Van',async()=>{
 const pg=await readFile(new URL('../lib/warehouse-queue-paging.ts',import.meta.url),'utf8')
 const tsOpts={compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}
 const loaded={exports:{}}
 vm.runInNewContext(ts.transpileModule(pg,tsOpts).outputText,{module:loaded,exports:loaded.exports,console,Promise,Map,Set})
 const fnSource=(await readFile(new URL('../lib/actions.ts',import.meta.url),'utf8'))
 const first=fnSource.indexOf('export async function getJobMaterialAllocations(')
 const last=fnSource.indexOf('export async function resolveJobMaterialAllocation(',first)
 assert.ok(first>=0&&last>first)
 const companies={mine:'co1',other:'co2'}
 const allocations=[]
 for(let n=0;n<421;n++)allocations.push({id:'a'+n,company_id:'co1',van_id:'v1',status:'on_site',created_at:String(n).padStart(6,'0')})
 for(let n=0;n<14;n++)allocations.push({id:'b'+n,company_id:'co1',van_id:'v2',status:'on_site',created_at:'99999'+n})
 for(let n=0;n<12;n++)allocations.push({id:'z'+n,company_id:'co2',van_id:'v1',status:'on_site',created_at:'ZZZ'+n})
 allocations.push({id:'closed',company_id:'co1',van_id:'v1',status:'returned',created_at:'999999'})
 const database={job_material_allocations:allocations}
 const create=async office=>{
  const ctx={exports:{},console,Promise,Map,Set,
   getCurrentProfile:async()=>({id:'u1',company_id:companies.mine,role:office?'admin':'technician'}),
   accessFor:async()=>({technician_access:!office,office_access:office}),
   getWorkingVans:async()=>({selectedId:'v1'}),
   createServerClient:()=>({from:x=>new Query(database,x)}),
   readAllWarehousePages:loaded.exports.readAllWarehousePages,
  }
  vm.runInNewContext(ts.transpileModule(fnSource.slice(first,last),tsOpts).outputText,ctx)
  return ctx.exports.getJobMaterialAllocations()
 }
 const tech=await create(false),office=await create(true)
 assert.equal(tech.length,421)
 assert.equal(office.length,435)
 assert.ok(tech.every(x=>x.company_id==='co1'&&x.van_id==='v1'))
 assert.ok(office.every(x=>x.company_id==='co1'&&x.status==='on_site'))
})
