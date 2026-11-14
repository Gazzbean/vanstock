export type TransactionVisualState = 'idle' | 'ready' | 'pending' | 'success' | 'error'

// Visual states describe the transaction lifecycle, not stock authorisation.
export function transactionBorder(state:TransactionVisualState){
  switch(state){
    case 'ready': return 'border-amber-500 bg-amber-50/30'
    case 'pending': return 'border-amber-500 bg-amber-50/30'
    case 'success': return 'border-green-600 bg-green-50/30'
    case 'error': return 'border-red-500'
    default: return 'border-gray-200'
  }
}
