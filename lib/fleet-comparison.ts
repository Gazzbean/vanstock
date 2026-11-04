// Display-only fleet totals: quantities are summed only for the same product
// and therefore always share a stock unit. Never combine unlike products.
export type FleetBalance = {van_id:string;product_id:string;quantity:number}
export type FleetProduct = {id:string;name:string;category:string;stock_unit:string|null}

export function buildFleetComparisonRows(
  products:FleetProduct[],vans:{id:string}[],balances:FleetBalance[],
){
 const productsById=new Map(products.map(p=>[p.id,p]))
 const vanIds=new Set(vans.map(v=>v.id))
 const rows=new Map<string,{product:FleetProduct;byVan:Record<string,number>;total:number}>()
 for(const b of balances){
  if(!vanIds.has(b.van_id))continue
  const product=productsById.get(b.product_id)
  if(!product)continue
  const quantity=Number(b.quantity)
  if(!Number.isFinite(quantity))continue
  let row=rows.get(b.product_id)
  if(!row){row={product,byVan:{},total:0};rows.set(b.product_id,row)}
  row.byVan[b.van_id]=Math.round(((row.byVan[b.van_id]??0)+quantity)*100)/100
  row.total=Math.round((row.total+quantity)*100)/100
 }
 return [...rows.values()].sort((a,b)=>a.product.name.localeCompare(b.product.name))
}
