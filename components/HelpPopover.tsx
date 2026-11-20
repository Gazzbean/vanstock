'use client'

import { useId, useRef } from 'react'
import Link from 'next/link'

export default function HelpPopover({
  title, steps, href,
}: { title: string; steps: string[]; href?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  return <span className="inline-flex align-middle">
    <button ref={trigger} type="button" aria-label={`Help with ${title}`}
      aria-haspopup="dialog"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
      onClick={() => dialog.current?.showModal()}>
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-semibold">?</span>
    </button>
    <dialog ref={dialog} aria-labelledby={titleId}
      className="m-auto max-h-[80dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 text-left text-sm text-gray-800 shadow-xl backdrop:bg-black/30"
      onClose={() => trigger.current?.focus()}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <div onClick={event => event.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="pt-2 font-semibold">{title}</h2>
          <button type="button" autoFocus aria-label="Close help"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-100"
            onClick={() => dialog.current?.close()}>×</button>
        </div>
        <ul className="list-disc space-y-2 pl-5">{steps.map(step => <li key={step}>{step}</li>)}</ul>
        {href && <Link href={href} className="mt-4 inline-flex min-h-11 items-center text-blue-700 underline">Read full SOP →</Link>}
      </div>
    </dialog>
  </span>
}
