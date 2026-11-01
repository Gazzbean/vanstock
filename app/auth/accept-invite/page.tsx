'use client'
import {useEffect,useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {createBrowserClient} from '@supabase/ssr'

export default function AcceptInvitePage(){
 const router=useRouter()
 const [ready,setReady]=useState(false)
 const [error,setError]=useState('')
 const [password,setPassword]=useState('')
 const [confirmation,setConfirmation]=useState('')
 const [pending,start]=useTransition()
 const [client]=useState(()=>createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 ))
 useEffect(()=>{
  let alive=true
  async function verify(){
   try{
    const params=new URLSearchParams(window.location.search)
    const hash=new URLSearchParams(window.location.hash.slice(1))
    const authError=params.get('error_description')||hash.get('error_description')
    if(authError){if(alive)setError(authError);return}
    const token=hash.get('access_token'),refresh=hash.get('refresh_token')
    if(token&&refresh){
     const {error:e}=await client.auth.setSession({access_token:token,refresh_token:refresh})
     if(e)throw e
     window.history.replaceState({},'',window.location.pathname)
    }else if(params.has('code')){
     const {error:e}=await client.auth.exchangeCodeForSession(params.get('code')!)
     if(e)throw e
     window.history.replaceState({},'',window.location.pathname)
    }
    const {data:{user},error:e}=await client.auth.getUser()
    if(e||!user)throw new Error('The invitation link has expired or could not be verified. Ask your administrator for a new invitation.')
    if(alive)setReady(true)
   }catch(e){if(alive)setError(e instanceof Error?e.message:'Could not verify the invitation')}
  }
  verify()
  return()=>{alive=false}
 },[client])
 function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setError('')
  if(password.length<12){setError('Use a password with at least 12 characters.');return}
  if(password!==confirmation){setError('Passwords do not match.');return}
  start(async()=>{
   const {error:e}=await client.auth.updateUser({password})
   if(e){setError(e.message);return}
   router.replace('/dashboard')
   router.refresh()
  })
 }
 return <main className="max-w-md mx-auto mt-16 p-6 bg-white border border-gray-200 rounded-xl">
  <h1 className="text-lg font-semibold">Activate your VanStock account</h1>
  <p className="text-sm text-gray-600 mt-2 mb-4">Set your password to finish accepting the invitation.</p>
  {error&&<p role="alert" className="alert alert-danger mb-3">{error}</p>}
  {!ready&&!error&&<p className="text-sm">Verifying invitation…</p>}
  {ready&&<form onSubmit={save} className="space-y-3">
   <div><label htmlFor="new-password" className="form-label">New password</label>
    <input id="new-password" type="password" className="form-input" minLength={12} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div>
   <div><label htmlFor="confirm-password" className="form-label">Confirm password</label>
    <input id="confirm-password" type="password" className="form-input" minLength={12} autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></div>
   <button type="submit" className="btn btn-primary" disabled={pending}>{pending?'Setting password…':'Set password and continue'}</button>
  </form>}
  <p className="text-xs text-gray-500 mt-4">If the invitation has expired, ask your administrator to send another. Never share your invitation link or password.</p>
 </main>
}
