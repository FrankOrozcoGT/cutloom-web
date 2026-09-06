export type SubscriptionStatus = 'active' | 'past_due' | 'inactive'

export interface PlanFeature {
  feature: string
  usageLimit: number | null
}

export interface Plan {
  id: string
  name: string
  amountInCents: number
  currency: string
  interval: string
  features: PlanFeature[]
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
