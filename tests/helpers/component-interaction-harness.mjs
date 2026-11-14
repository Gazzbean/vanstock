import ts from 'typescript'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'

const root=new URL('../../',import.meta.url)
function compile(source,file){
 return ts.transpileModule(source,{fileName:file,compilerOptions:{
  jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,
  target:ts.ScriptTarget.ES2020,esModuleInterop:true
 }}).outputText
}
function loadJS(source,file,requireModule){
 const module={exports:{}}
 vm.runInNewContext(compile(source,file),{module,exports:module.exports,require:requireModule,console,Promise,Set,Map},{filename:file})
 return module.exports
}
const borderSource=await readFile(new URL('../../lib/transaction-confirmation.ts',import.meta.url),'utf8')
const transaction=loadJS(borderSource,'transaction-confirmation.ts',()=>{throw new Error('Unexpected import')})

const jsx=(type,props,key)=>({type,props:props??{},key})
const jsxRuntime={jsx,jsxs:jsx,Fragment:Symbol.for('react.fragment')}

export async function createHarness(file,actions={}){
 const state=[],tasks=[]
 let cursor=0,refreshCount=0
 const useState=initial=>{
  const index=cursor++
  if(!(index in state))state[index]=typeof initial==='function'?initial():initial
  return [state[index],next=>{state[index]=typeof next==='function'?next(state[index]):next}]
 }
 const useRef=initial=>{
  const index=cursor++
  if(!(index in state))state[index]={current:initial}
  return state[index]
 }
 const useTransition=()=>{
  const [pending,setPending]=useState(false)
  return [pending,fn=>{
   setPending(true)
   const task=Promise.resolve().then(fn).finally(()=>setPending(false))
   tasks.push(task)
  }]
 }
 const hooks={useState,useRef,useTransition,useEffect:()=>{cursor++}}
 const mockComponent=({title,children})=>jsx('notice',{children:[title,children]})
 const requireModule=id=>{
  if(id==='react')return hooks
  if(id==='react/jsx-runtime')return jsxRuntime
  if(id==='next/navigation')return {useRouter:()=>({refresh:()=>{refreshCount++}})}
  if(id==='@/lib/transaction-confirmation')return transaction
  if(id==='@/lib/actions')return actions
  if(id.startsWith('./'))return {__esModule:true,default:mockComponent}
  throw new Error('Unexpected component import: '+id)
 }
 const source=await readFile(new URL('../../'+file,import.meta.url),'utf8')
 const component=loadJS(source,file,requireModule).default
 if(typeof component!=='function')throw new Error('No default component in '+file)
 return {
  render(props){cursor=0;return component(props)},
  async flush(){await Promise.all(tasks.splice(0));await Promise.resolve()},
  get refreshCount(){return refreshCount}
 }
}

export function nodes(tree){
 const result=[]
 function visit(node){
  if(node===null||node===undefined||typeof node==='boolean')return
  if(Array.isArray(node)){node.forEach(visit);return}
  if(typeof node!=='object')return
  if(typeof node.type==='function'){visit(node.type(node.props));return}
  result.push(node)
  visit(node.props?.children)
 }
 visit(tree)
 return result
}
export function byId(tree,id){
 const found=nodes(tree).find(x=>x.props?.id===id)
 if(!found)throw new Error('Control not found: '+id)
 return found
}
export function textOf(tree){
 if(tree===null||tree===undefined||typeof tree==='boolean')return ''
 if(Array.isArray(tree))return tree.map(textOf).join(' ')
 if(typeof tree==='string'||typeof tree==='number')return String(tree)
 if(typeof tree?.type==='function')return textOf(tree.type(tree.props))
 return textOf(tree?.props?.children)
}
export function button(tree,match){
 const found=nodes(tree).find(x=>x.type==='button'&&textOf(x).includes(match))
 if(!found)throw new Error('Button not found: '+match)
 return found
}
export function change(tree,id,value){
 const element=byId(tree,id)
 element.props.onChange({target:{value}})
}
export function deferred(){
 let resolve,reject
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no})
 return {promise,resolve,reject}
}
