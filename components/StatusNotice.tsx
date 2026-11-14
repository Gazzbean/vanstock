import type {ReactNode} from 'react'

type Tone='info'|'warning'|'success'|'error'|'restricted'
const appearances:Record<Tone,{border:string;icon:string;label:string}>={
  info:{border:'border-blue-300 bg-blue-50 text-blue-900',icon:'ⓘ',label:'Information'},
  warning:{border:'border-amber-400 bg-amber-50 text-amber-950',icon:'⚠',label:'Warning'},
  success:{border:'border-green-300 bg-green-50 text-green-900',icon:'✓',label:'Success'},
  error:{border:'border-red-300 bg-red-50 text-red-900',icon:'!',label:'Error'},
  restricted:{border:'border-gray-300 bg-gray-50 text-gray-800',icon:'🔒',label:'Restricted'},
}
export default function StatusNotice({tone,title,children}:{tone:Tone;title:string;children:ReactNode}){
  const style=appearances[tone]
  return <div className={'rounded-lg border px-3 py-3 text-sm '+style.border} role={tone==='error'||tone==='warning'?'alert':'status'}>
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="font-semibold text-base leading-5">{style.icon}</span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  </div>
}
