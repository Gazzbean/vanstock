import {redirect} from 'next/navigation'
import Link from 'next/link'
import {getCurrentUserDisplay} from '@/lib/actions'
import {inspectRuntimeIdentity,AUDITED_PRODUCTION_SUPABASE_REF} from '@/lib/deployment-identity'

// A01: never statically cache this deployment's environment identity.
export const dynamic='force-dynamic'
export const revalidate=0

export default async function DeploymentCheckPage(){
 const user=await getCurrentUserDisplay()
 if(!user)redirect('/login')
 if(user.role!=='admin')redirect('/dashboard')

 const identity=inspectRuntimeIdentity({
  vercelEnvironment:process.env.VERCEL_ENV,
  vercelTargetEnvironment:process.env.VERCEL_TARGET_ENV,
  commitSha:process.env.VERCEL_GIT_COMMIT_SHA,
  commitBranch:process.env.VERCEL_GIT_COMMIT_REF,
  deploymentHost:process.env.VERCEL_URL,
  configuredProductionHost:process.env.VERCEL_PROJECT_PRODUCTION_URL,
  supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
  warehouseWritesSetting:process.env.WAREHOUSE_WRITES_ENABLED,
 })
 const danger=identity.risk==='preview_uses_live'||identity.risk==='production_mismatch'
 const rows=[
  ['Vercel deployment environment',identity.environment],
  ['Vercel target environment',identity.targetEnvironment],
  ['Git branch',identity.branch],
  ['Deployed commit SHA',identity.commit],
  ['Unique deployment hostname (not proof of alias)',identity.deploymentHost],
  ['Production hostname hint (not proof of alias)',identity.productionHostHint],
  ['Configured Supabase project reference',identity.supabaseProjectRef],
  ['Audited production Supabase reference',AUDITED_PRODUCTION_SUPABASE_REF],
  ['WAREHOUSE_WRITES_ENABLED (effective for gated actions)',identity.warehouseWritesEnabled?'Enabled':'Disabled / unset'],
 ]
 return <div>
  <div className="topbar"><h1 className="topbar-title">Deployment Identity – A01</h1></div>
  <div className="p-5 space-y-4">
   <section className="card">
    <h2 className="text-sm font-semibold">Administrator-only, read-only deployment check</h2>
    <p className="text-sm text-gray-600 mt-2">These details come from the environment serving this page. No database stock records, environment variables or Vercel settings are changed. API keys and credentials are never displayed.</p>
    <p className="text-xs text-gray-500 mt-2">The warehouse-write flag is not a global application read-only lock. Other workflows can write stock under their separate permissions.</p>
   </section>
   <section className={'card border-2 '+(danger?'border-red-500':'border-amber-500')}>
    <h2 className={'text-sm font-semibold '+(danger?'text-red-800':'text-amber-900')}>
     {danger?'Deployment connection needs immediate attention':'Environment verification not yet signed off'}
    </h2>
    <p className="text-sm mt-2">{identity.explanation}</p>
    <p className="text-sm font-semibold mt-2">Operational pilot status: NOT APPROVED.</p>
   </section>
   <section className="card">
    <h2 className="text-sm font-semibold mb-3">Runtime evidence</h2>
    <div className="overflow-x-auto"><table className="w-full">
      <tbody>{rows.map(([label,value])=><tr key={label} className="border-t">
       <th scope="row" className="table-cell text-left text-sm font-medium align-top w-1/2">{label}</th>
       <td className="table-cell text-sm break-all">{value}</td>
      </tr>)}</tbody>
    </table></div>
   </section>
   <section className="card">
    <h2 className="text-sm font-semibold mb-2">Remaining release checks</h2>
    <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
     <li>Open this page in the actual Production site, then on the intended Preview URL. Record the environment and Git SHA shown for each.</li>
     <li>Confirm the Preview database project reference is different from the audited production reference, and verify the second project is explicitly designated safe for test stock transactions.</li>
     <li>In Vercel, confirm Domains/Deployment aliases, environment-variable scopes, and any branch-specific overrides. A deployment hostname alone does not prove the public production alias.</li>
     <li>Only after the release owner has verified isolation, complete the separate A06 browser and A08–A10 operational acceptance gates. Do not create synthetic stock transactions in the live database.</li>
    </ol>
    <div className="mt-4 flex gap-4 flex-wrap text-sm">
     <Link className="text-blue-700 underline" href="/admin">Back to Administration</Link>
     <a className="text-blue-700 underline" href="https://vercel.com/simplicityair/vanstock/settings/environment-variables" target="_blank" rel="noopener noreferrer">Vercel environment settings</a>
     <a className="text-blue-700 underline" href="https://github.com/Gazzbean/vanstock/blob/main/docs/A11-technical-audit-and-pilot-gate.md" target="_blank" rel="noopener noreferrer">Audit release checklist</a>
    </div>
   </section>
  </div>
 </div>
}
