// Fail closed: warehouse stock writes are explicitly opt-in in the deployment.
// An absent, misspelled or false value must not enable stock-changing actions.
export function warehouseWritesEnabled(value: string | undefined): boolean {
  return value === 'true'
}
