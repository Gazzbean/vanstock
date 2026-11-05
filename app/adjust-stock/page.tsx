import { redirect } from 'next/navigation'
import { getCurrentUserDisplay } from '@/lib/actions'
import { getAdjustmentOptions } from '@/lib/stock-adjustment-actions'
import StockCorrectionForm from '@/components/StockCorrectionForm'

export default async function AdjustStockPage() {
  const user = await getCurrentUserDisplay()
  if (!user) redirect('/login')
  if (user.role !== 'admin') return <div className="p-5"><h1 className="text-lg font-semibold">Stock Adjustment</h1><p className="text-sm mt-3">Administrator access required.</p></div>
  const data = await getAdjustmentOptions()
  return <div>
    <div className="topbar"><h1 className="topbar-title">Stock Adjustment</h1></div>
    <div className="p-5 max-w-5xl"><StockCorrectionForm {...data}/></div>
  </div>
}
