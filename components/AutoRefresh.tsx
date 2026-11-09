'use client'

import {useEffect} from 'react'
import {useRouter} from 'next/navigation'

/** Refresh server data without reloading the document or discarding form input. */
export default function AutoRefresh(){
  const router=useRouter()
  useEffect(()=>{
    let last=Date.now()
    const refresh=()=>{
      if(document.visibilityState!=='visible'||Date.now()-last<15_000)return
      last=Date.now()
      router.refresh()
    }
    const interval=window.setInterval(refresh,30_000)
    const focused=()=>refresh()
    window.addEventListener('focus',focused)
    document.addEventListener('visibilitychange',focused)
    return()=>{
      window.clearInterval(interval)
      window.removeEventListener('focus',focused)
      document.removeEventListener('visibilitychange',focused)
    }
  },[router])
  return null
}
