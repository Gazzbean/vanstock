// Internal van transfers move the product's canonical stock unit.
// Pack labels are for entering quantities; they are never a second stock unit.
export function transferStockUnits(
 mode:'pack'|'loose',enteredQuantity:number,unitsPerPack:number|null,stockUnit:string,
):number{
 if(!Number.isFinite(enteredQuantity)||enteredQuantity<=0||enteredQuantity>=1_000_000_000)return 0
 if(mode==='pack'&&(!Number.isSafeInteger(enteredQuantity)||!unitsPerPack||
  !Number.isFinite(unitsPerPack)||unitsPerPack<=0))return 0
 const stockQty=mode==='pack'?enteredQuantity*(unitsPerPack??0):enteredQuantity
 if(!Number.isFinite(stockQty)||stockQty<=0||stockQty>=1_000_000_000||
  Math.abs(stockQty*100-Math.round(stockQty*100))>1e-7)return 0
 if(['ea','pack','container','roll'].includes(stockUnit)&&!Number.isSafeInteger(stockQty))return 0
 return stockQty
}
