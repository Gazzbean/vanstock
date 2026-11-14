// A07: open warehouse requests are never truncated by a recent-history cap.
// Reused for paged notifications so dismissed history cannot displace unread work.
export const WAREHOUSE_PAGE_SIZE=400
export const WAREHOUSE_HISTORY_LIMIT=100
export const OPEN_WAREHOUSE_STATUSES=['pending','approved','issued'] as const

export type PageResult<T>={data:T[]|null;error:{message:string;code?:string}|null}

export async function readAllWarehousePages<T>(
  page:(from:number,to:number)=>Promise<PageResult<T>>,
  pageSize=WAREHOUSE_PAGE_SIZE,
):Promise<PageResult<T>>{
  if(!Number.isInteger(pageSize)||pageSize<1)throw new Error('Invalid warehouse page size')
  const all:T[]=[]
  for(let from=0;;from+=pageSize){
    const {data,error}=await page(from,from+pageSize-1)
    if(error)return {data:null,error}
    const batch=data??[]
    all.push(...batch)
    if(batch.length<pageSize)break
  }
  return {data:all,error:null}
}

type RequestRow={id:string;status:string;created_at:string}

// Active items are not subject to the closed-history limit; a specifically
// authorised history record is retained even when >100 newer items exist.
export function mergeWarehouseQueue<T extends RequestRow>(
  openGroups:T[][],
  recentHistoryGroups:T[][],
  focused:T|null=null,
  historyLimit=WAREHOUSE_HISTORY_LIMIT,
):T[]{
  const open=new Map<string,T>()
  const history=new Map<string,T>()
  for(const group of [...openGroups,...recentHistoryGroups]){
    for(const row of group){
      if(OPEN_WAREHOUSE_STATUSES.some(status=>status===row.status))open.set(row.id,row)
      else history.set(row.id,row)
    }
  }
  const byRecent=(a:T,b:T)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)
  const recent=[...history.values()].sort(byRecent).slice(0,historyLimit)
  if(focused){
    if(OPEN_WAREHOUSE_STATUSES.some(status=>status===focused.status))open.set(focused.id,focused)
    else if(!recent.some(x=>x.id===focused.id))recent.push(focused)
  }
  return [...open.values(),...recent].sort(byRecent)
}
