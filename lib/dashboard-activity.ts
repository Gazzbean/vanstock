// Perth observes UTC+08 year-round. Use a fixed boundary rather than the
// server's timezone, which can differ between local development and Vercel.
const perthOffsetMilliseconds=8*60*60*1000
const dayMilliseconds=24*60*60*1000

export function perthDayStartUtc(now:Date):string{
  const shifted=now.getTime()+perthOffsetMilliseconds
  const dayStart=Math.floor(shifted/dayMilliseconds)*dayMilliseconds-perthOffsetMilliseconds
  return new Date(dayStart).toISOString()
}

export function countTodayStockActivity(logs:{type:string}[]){
  const transfers=new Set(['van-to-van','warehouse-to-van','van-to-warehouse'])
  return {
    transfersToday:logs.filter(log=>transfers.has(log.type)).length,
    issuedToday:logs.filter(log=>log.type==='issue').length,
  }
}
