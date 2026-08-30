export function formatPlanAmount(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency }).format(amountInCents / 100)
}
