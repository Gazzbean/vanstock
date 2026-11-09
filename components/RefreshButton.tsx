'use client'

import {useRouter} from 'next/navigation'
import {useTransition} from 'react'

export default function RefreshButton(){
 const router=useRouter()
 const [pending,start]=useTransition()
 return <button type="button" disabled={pending} onClick={()=>start(()=>router.refresh())} className="btn min-h-11" aria-label="Refresh actions">{pending?'Refreshing…':'↻ Refresh'}</button>
}
