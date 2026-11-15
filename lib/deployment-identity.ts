// A01 — Server-rendered, non-secret deployment identity checks.
// This helper never accepts, inspects or returns Supabase API keys.
export const AUDITED_PRODUCTION_SUPABASE_REF='aqdwqargcjnhvupwtjcr'

export type RuntimeIdentityInput={
  vercelEnvironment?:string
  vercelTargetEnvironment?:string
  commitSha?:string
  commitBranch?:string
  deploymentHost?:string
  configuredProductionHost?:string
  supabaseUrl?:string
  warehouseWritesSetting?:string
}

export type RuntimeIdentity={
  environment:'production'|'preview'|'development'|'unknown'
  targetEnvironment:string
  branch:string
  commit:string
  deploymentHost:string
  productionHostHint:string
  supabaseProjectRef:string
  warehouseWritesEnabled:boolean
  risk:'preview_uses_live'|'production_mismatch'|'production_matches'|'preview_unverified'|'unknown'
  explanation:string
}

function hostnameOrUnknown(value?:string):string{
  if(!value||!(/^[a-z0-9.-]+$/i).test(value)||value.length>255||
     value.includes('..')||value.startsWith('.')||value.endsWith('.'))return 'Not supplied'
  return value
}

export function supabaseRefFromUrl(value?:string):string|null{
  try{
    if(!value)return null
    const url=new URL(value)
    if(url.protocol!=='https:'||url.username||url.password||url.port||
      url.pathname!=='/'||url.search||url.hash)return null
    const match=/^([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname)
    return match?.[1]?.toLowerCase()??null
  }catch{return null}
}

export function inspectRuntimeIdentity(input:RuntimeIdentityInput):RuntimeIdentity{
  const environment=input.vercelEnvironment==='production'||input.vercelEnvironment==='preview'||
    input.vercelEnvironment==='development'?input.vercelEnvironment:'unknown'
  const projectRef=supabaseRefFromUrl(input.supabaseUrl)
  const commit=/^[a-f0-9]{40}$/i.test(input.commitSha??'')?input.commitSha!:'Not supplied'
  const branch=/^[a-z0-9][a-z0-9._\/-]{0,160}$/i.test(input.commitBranch??'')
    ?input.commitBranch!:'Not supplied'
  let risk:RuntimeIdentity['risk']='unknown'
  let explanation='Deployment environment or database project reference is unavailable; do not approve stock-write testing.'
  if(environment==='preview'&&projectRef===AUDITED_PRODUCTION_SUPABASE_REF){
    risk='preview_uses_live'
    explanation='Preview targets the audited production Supabase project. DO NOT perform test stock transactions.'
  }else if(environment==='production'&&projectRef&&projectRef!==AUDITED_PRODUCTION_SUPABASE_REF){
    risk='production_mismatch'
    explanation='Production targets a database different from the audited project. Investigate before allowing stock transactions.'
  }else if(environment==='production'&&projectRef===AUDITED_PRODUCTION_SUPABASE_REF){
    risk='production_matches'
    explanation='Production database reference matches the audited project. Domain alias, permissions and physical acceptance are still unverified.'
  }else if(environment==='preview'&&projectRef){
    risk='preview_unverified'
    explanation='Preview uses a different database reference. Its purpose, data and safe isolation still require confirmation before testing writes.'
  }
  return {
    environment,
    targetEnvironment:input.vercelTargetEnvironment||'Not supplied',
    branch,commit,
    deploymentHost:hostnameOrUnknown(input.deploymentHost),
    productionHostHint:hostnameOrUnknown(input.configuredProductionHost),
    supabaseProjectRef:projectRef??'Not supplied / custom domain',
    warehouseWritesEnabled:input.warehouseWritesSetting==='true',
    risk,explanation,
  }
}
