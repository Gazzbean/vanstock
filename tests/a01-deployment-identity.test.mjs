import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'
import {
 AUDITED_PRODUCTION_SUPABASE_REF,
 supabaseRefFromUrl,
 inspectRuntimeIdentity,
} from '../lib/deployment-identity.ts'

const prodUrl=`https://${AUDITED_PRODUCTION_SUPABASE_REF}.supabase.co`
const previewRef='bbbbbbbbbbbbbbbbbbbb'
const previewUrl=`https://${previewRef}.supabase.co`
const sha='c18f8dcce3ce7732ae1a3727e4cce8826e444fdf'

test('A01 Supabase project reference validation accepts only canonical public project hosts',()=>{
 assert.equal(supabaseRefFromUrl(prodUrl),AUDITED_PRODUCTION_SUPABASE_REF)
 assert.equal(supabaseRefFromUrl(prodUrl+'/'),AUDITED_PRODUCTION_SUPABASE_REF)
 for(const address of [
   undefined,'','https://evil.test','http://'+AUDITED_PRODUCTION_SUPABASE_REF+'.supabase.co',
   'https://'+AUDITED_PRODUCTION_SUPABASE_REF+'.supabase.co.evil.test',
   'https://a:secret@'+AUDITED_PRODUCTION_SUPABASE_REF+'.supabase.co',
   prodUrl+'/rest/v1',prodUrl+'?key=secret',
   'https://localhost:54321','https://'+AUDITED_PRODUCTION_SUPABASE_REF+'.supabase.co:8443',
 ]){
  assert.equal(supabaseRefFromUrl(address),null,String(address))
 }
})

test('A01 preview connected to production must show unsafe status, even if warehouse flag is false',()=>{
 const r=inspectRuntimeIdentity({
  vercelEnvironment:'preview',commitSha:sha,commitBranch:'audit-a01-deployment-identity',
  supabaseUrl:prodUrl,warehouseWritesSetting:'false',
  deploymentHost:'vanstock-git-a01.vercel.app',
 })
 assert.equal(r.environment,'preview')
 assert.equal(r.risk,'preview_uses_live')
 assert.match(r.explanation,/DO NOT perform test stock transactions/)
 assert.equal(r.commit,sha)
 assert.equal(r.warehouseWritesEnabled,false)
})

test('A01 preview with different Supabase project is NOT automatically approved for testing',()=>{
 const r=inspectRuntimeIdentity({vercelEnvironment:'preview',supabaseUrl:previewUrl,warehouseWritesSetting:'true'})
 assert.equal(r.risk,'preview_unverified')
 assert.match(r.explanation,/still require confirmation/)
 assert.equal(r.warehouseWritesEnabled,true)
})

test('A01 production reports matching and unexpected refs without claiming alias verification',()=>{
 const good=inspectRuntimeIdentity({vercelEnvironment:'production',supabaseUrl:prodUrl})
 assert.equal(good.risk,'production_matches')
 assert.match(good.explanation,/Domain alias/)
 const mismatch=inspectRuntimeIdentity({vercelEnvironment:'production',supabaseUrl:previewUrl})
 assert.equal(mismatch.risk,'production_mismatch')
 assert.match(mismatch.explanation,/Investigate/)
})

test('A01 missing runtime variables are unknown, not passed or silently defaulted to live',()=>{
 const r=inspectRuntimeIdentity({})
 assert.equal(r.environment,'unknown')
 assert.equal(r.risk,'unknown')
 assert.equal(r.supabaseProjectRef,'Not supplied / custom domain')
 assert.equal(r.commit,'Not supplied')
 assert.equal(r.deploymentHost,'Not supplied')
 assert.equal(r.warehouseWritesEnabled,false)
 for(const falseValue of ['TRUE',' true ','yes','1',undefined]){
  assert.equal(inspectRuntimeIdentity({warehouseWritesSetting:falseValue}).warehouseWritesEnabled,false)
 }
 assert.equal(inspectRuntimeIdentity({warehouseWritesSetting:'true'}).warehouseWritesEnabled,true)
})

const pageSource=await readFile(new URL('../app/admin/deployment/page.tsx',import.meta.url),'utf8')
const adminSource=await readFile(new URL('../app/admin/page.tsx',import.meta.url),'utf8')
const jsx=(type,props)=>({type,props:props??{}})
const jsxRuntime={jsx,jsxs:jsx,Fragment:Symbol.for('fragment')}
function textOf(tree){
 if(tree===null||tree===undefined||typeof tree==='boolean')return ''
 if(typeof tree==='string'||typeof tree==='number')return String(tree)
 if(Array.isArray(tree))return tree.map(textOf).join(' ')
 return textOf(tree.props?.children)
}
async function render(role){
 const exports={};const module={exports}
 const src=ts.transpileModule(pageSource,{fileName:'app/admin/deployment/page.tsx',
  compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText
 vm.runInNewContext(src,{
  module,exports,process:{env:{
   VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:prodUrl,
   WAREHOUSE_WRITES_ENABLED:'true',SUPABASE_SERVICE_ROLE_KEY:'DO_NOT_EXPOSE_SUPER_SECRET_KEY',
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'DO_NOT_EXPOSE_ANON_KEY',
   VERCEL_GIT_COMMIT_SHA:sha,
  }},
  require:id=>{
   if(id==='react/jsx-runtime')return jsxRuntime
   if(id==='next/navigation')return {redirect:to=>{throw new Error('REDIRECT:'+to)}}
   if(id==='next/link')return ()=>null
   if(id==='@/lib/actions')return {getCurrentUserDisplay:async()=>role?{role}:null}
   if(id==='@/lib/deployment-identity')return {inspectRuntimeIdentity,AUDITED_PRODUCTION_SUPABASE_REF}
   throw new Error('Unexpected import '+id)
  },
 },{filename:'app/admin/deployment/page.tsx'})
 return module.exports.default()
}
test('A01 deployment route rejects unauthenticated and all non-admin users',async()=>{
 await assert.rejects(render(null),/REDIRECT:\/login/)
 for(const role of ['manager','technician','office','other'])
   await assert.rejects(render(role),/REDIRECT:\/dashboard/)
})
test('A01 admin can inspect runtime identity but no keys, and page is always dynamic',async()=>{
 const page=await render('admin')
 const txt=textOf(page)
 assert.match(txt,/Preview targets the audited production Supabase project/)
 assert.match(txt,/Operational pilot status: NOT APPROVED/)
 assert.match(txt,new RegExp(AUDITED_PRODUCTION_SUPABASE_REF))
 assert.match(txt,/WAREHOUSE_WRITES_ENABLED/)
 assert.doesNotMatch(txt,/DO_NOT_EXPOSE_SUPER_SECRET_KEY|DO_NOT_EXPOSE_ANON_KEY/)
 assert.match(pageSource,/export const dynamic='force-dynamic'/)
 assert.match(pageSource,/export const revalidate=0/)
 assert.match(adminSource,/user.role==='admin'.*?href="\/admin\/deployment"/s)
})
