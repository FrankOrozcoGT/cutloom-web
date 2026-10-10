export type SubscriptionStatus = 'active' | 'past_due' | 'inactive'

export interface Plan {
  id: string
  name: string
  amountInCents: number
  currency: string
  interval: string
  /** Features que habilita el plan — ya no trae tope por feature (ver creditsPerCycle: ahora hay un pozo único de crédito compartido entre todas). */
  features: string[]
  /** Total de créditos que el plan otorga por ciclo de facturación, a repartir libremente entre las features habilitadas — reemplaza el tope por feature que antes vivía en cada PlanFeature. */
  creditsPerCycle: number
}

export interface Subscription {
  planId: string | null
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

export interface ChangePlanResult {
  status: SubscriptionStatus
  planId: string
  currentPeriodStart: string
  currentPeriodEnd: string
  proratedAmountInCents: number
}

export interface CreditBalance {
  balance: number
}

export interface CheckoutLink {
  checkoutUrl: string
}

export interface DonationLink {
  donationUrl: string
}

export interface CancelSubscriptionResult {
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string
}
