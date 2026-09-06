import type {
  CancelSubscriptionResult,
  ChangePlanResult,
  CheckoutLink,
  CreditBalance,
  DonationLink,
  Plan,
  Subscription,
} from '@domain/billing'
import type { Result } from '@application/result'
import type { BillingError } from './errors'

export interface BillingApi {
  getPlans(): Promise<Result<Plan[], BillingError>>
  getSubscription(): Promise<Result<Subscription | null, BillingError>>
  createCheckout(planId: string): Promise<Result<CheckoutLink, BillingError>>
  cancel(): Promise<Result<CancelSubscriptionResult, BillingError>>
  changePlan(planId: string): Promise<Result<ChangePlanResult, BillingError>>
  topUpCredits(amountInCents: number, currency?: string): Promise<Result<CheckoutLink, BillingError>>
  getCreditsBalance(): Promise<Result<CreditBalance, BillingError>>
  donateCoffee(amountInCents: number, currency?: string): Promise<Result<DonationLink, BillingError>>
}
