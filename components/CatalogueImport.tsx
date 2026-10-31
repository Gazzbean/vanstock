'use client'

import { useState, useTransition } from 'react'
import { importProductCatalogue } from '@/lib/actions'

type Unit = 'ea'|'kg'|'m'|'pack'|'container'
type Item = { name: string; category: string; stock_unit: Unit; min_stock: number }
const units: Unit[] = ['ea','kg','m','pack','container']
const headings = ['name','category','stock_unit','min_stock']

// Small RFC4180-style parser (quoted fields, escaped double-quotes and newlines).
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"') {
        if (source[i+1] === '"') { cell += '"'; i++ }
        else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i+1] === '\n') i++
      row.push(cell)
      if (row.some(v => v.trim())) rows.push(row)
      row = []; cell = ''
    } else if (ch === '"') throw Error('Unexpected quote in CSV.')
    else cell += ch
  }
  if (quoted) throw Error('Unclosed quoted CSV field.')
  row.push(cell)
  if (row.some(v => v.trim())) rows.push(row)
  return rows
}

export default function CatalogueImport() {
  const [items,setItems] = useState<Item[]>([])
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [pending,startTransition] = useTransition()

  function template() {
    const csv = 'name,category,stock_unit,min_stock\nExample refrigerant R134a,Refrigerant,kg,5.00\nExample copper tube,Tube / cable,m,10.50\n'
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'vanstock-product-import-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function load(file?: File) {
    setError(''); setMessage(''); setItems([])
    if (!file) return
    if (file.size > 250000) { setError('CSV exceeds the 250 KB file limit.'); return }
    try {
      const rows = parseCSV(await file.text())
      if (rows.length < 2) throw Error('CSV must include headers and at least one product.')
      if (rows.length > 201) throw Error('Import a maximum of 200 products per file.')
      const header = rows[0].map(x => x.trim().toLowerCase())
      if (header.join('|') !== headings.join('|')) {
        throw Error('Use exactly these columns, in order: '+headings.join(', '))
      }
      const names = new Set<string>()
      const parsed: Item[] = []
      for (const [i, row] of rows.slice(1).entries()) {
        if (row.length !== 4) throw Error('Row '+(i+2)+': expected four columns.')
        const [name,category,unit,min] = row.map(s=>s.trim())
        if (!name || name.length > 200 || !category || category.length > 100)
          throw Error('Row '+(i+2)+': product name or category invalid.')
        if (!units.includes(unit as Unit)) throw Error('Row '+(i+2)+': invalid unit.')
        const decimal = unit === 'kg' || unit === 'm'
        if (!(decimal ? /^\d+(?:\.\d{1,2})?$/.test(min) : /^\d+$/.test(min)))
          throw Error('Row '+(i+2)+': minimum stock has invalid precision.')
        const quantity = Number(min)
        if (!Number.isFinite(quantity) || quantity >= 1000000000)
          throw Error('Row '+(i+2)+': minimum stock exceeds supported range.')
        const key = name.toLowerCase()
        if (names.has(key)) throw Error('Row '+(i+2)+': duplicate product name.')
        names.add(key)
        parsed.push({name,category,stock_unit:unit as Unit,min_stock:quantity})
      }
      setItems(parsed)
      setMessage(parsed.length+' products ready for review; nothing has been imported.')
    } catch(e) { setError(e instanceof Error ? e.message : 'Invalid CSV file.') }
  }

  function submit() {
    setError(''); setMessage('')
    if (!items.length) return
    startTransition(async()=>{
      try {
        const result = await importProductCatalogue(items)
        if (result.error) setError(result.error)
        else {
          setMessage('Imported '+result.imported+' products. No stock quantities were created.')
          setItems([])
        }
      } catch { setError('Import could not be confirmed. Check the catalogue before retrying.') }
    })
  }

  return <section className="card mt-4">
    <h2 className="text-sm font-medium mb-2">Bulk product import (CSV)</h2>
    <p className="text-xs text-gray-500 mb-3">
      Add product definitions only. Existing products and sample stock remain unchanged.
      Opening quantities are recorded separately after physical verification.
    </p>
    <button type="button" className="btn btn-sm mb-3" onClick={template}>Download CSV template</button>
    <label className="form-label" htmlFor="catalogue-csv">Select completed CSV file</label>
    <input id="catalogue-csv" className="form-input" type="file" accept=".csv,text/csv"
      onChange={e=>{ void load(e.target.files?.[0]); e.currentTarget.value='' }} />
    {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700 mt-3">{message}</p>}
    {items.length>0 && <>
      <p className="text-xs text-gray-500 mt-3">Preview: {items.length} products. Names must not already exist (including archived products).</p>
      <div className="overflow-x-auto mt-2" style={{maxHeight:'240px',overflowY:'auto'}}>
        <table className="w-full">
          <thead><tr>{headings.map(h=><th key={h} className="table-header">{h}</th>)}</tr></thead>
          <tbody>{items.map((p,i)=><tr key={i}>
            <td className="table-cell">{p.name}</td><td className="table-cell">{p.category}</td>
            <td className="table-cell">{p.stock_unit}</td><td className="table-cell">{p.min_stock}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <button type="button" disabled={pending} className="btn btn-primary mt-3" onClick={submit}>
        {pending?'Importing…':'Confirm import of '+items.length+' products'}
      </button>
    </>}
  </section>
}
