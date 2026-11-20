import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../app/dashboard/page.tsx',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText
function page(user){
 const module={exports:{}}
 const jsx=(type,props)=>({type,props})
 const actions=new Proxy({getCurrentUserDisplay:async()=>user},{get:(target,key)=>target[key]??(()=>{throw Error('Unauthorised data fetch: '+String(key))})})
 vm.runInNewContext(js,{module,exports:module.exports,require:id=>{
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx}
  if(id==='@/lib/actions')return actions
  if(id==='next/navigation')return {redirect:path=>{throw Error('redirect:'+path)}}
  return {default:()=>null}
 }})
 return module.exports.default
}
test('restricted Manager dashboard renders without fetching activity or van stock',async()=>{
 for(const warehouse_access of [false,true]){
  const result=await page({role:'manager',access:{office_access:false,technician_access:false},manager_operations:{warehouse_access}})({searchParams:{}})
  const output=JSON.stringify(result)
  assert.match(output,/Stock activity is not available/)
  assert.equal(output.includes('"href":"/warehouse"'),warehouse_access)
 }
})
test('signed-out dashboard redirects before protected data fetches',async()=>{
 await assert.rejects(page(null)({searchParams:{}}),/redirect:\/login/)
})
