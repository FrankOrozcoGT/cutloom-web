import type {
  CancelSubscriptionResult,
  ChangePlanResult,
  CheckoutLink,
  CreditBalance,
  DonationLink,
  Plan,
  Subscription,
} from '@domain/billing'
import type { BillingApi } from '@application/billing/ports'
import { BillingError } from '@application/billing/errors'
import { err, ok, type Result } from '@application/result'
import type { HttpClient } from '@infrastructure/http/client'
import { parseErrorBody, parseJson } from '@infrastructure/http/parseJson'
import {
  cancelSubscriptionResultSchema,
  changePlanResultSchema,
  checkoutLinkSchema,
  creditBalanceSchema,
  donationLinkSchema,
  mapBillingError,
  mapCancelSubscriptionResult,
  mapChangePlanResult,
  mapCheckoutLink,
  mapCreditBalance,
  mapDonationLink,
  mapPlan,
  mapSubscription,
  plansResponseSchema,
  subscriptionResponseSchema,
} from './mappers'

export class BillingApiAdapter implements BillingApi {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async getPlans(): Promise<Result<Plan[], BillingError>> {
    const response = await this.http.get('/api/billing/plans')
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, plansResponseSchema)
    return ok(body.plans.map(mapPlan))
  }

  async getSubscription(): Promise<Result<Subscription | null, BillingError>> {
    const response = await this.http.get('/api/billing/subscription')
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, subscriptionResponseSchema)
    return ok(body.subscription ? mapSubscription(body.subscription) : null)
  }

  async getCreditsBalance(): Promise<Result<CreditBalance, BillingError>> {
    const response = await this.http.get('/api/billing/credits/balance')
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, creditBalanceSchema)
    return ok(mapCreditBalance(body))
  }

  async createCheckout(planId: string): Promise<Result<CheckoutLink, BillingError>> {
    const response = await this.http.post('/api/billing/checkout', { planId })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, checkoutLinkSchema)
    return ok(mapCheckoutLink(body))
  }

  async cancel(): Promise<Result<CancelSubscriptionResult, BillingError>> {
    const response = await this.http.post('/api/billing/cancel')
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, cancelSubscriptionResultSchema)
    return ok(mapCancelSubscriptionResult(body))
  }

  async changePlan(planId: string): Promise<Result<ChangePlanResult, BillingError>> {
    const response = await this.http.post('/api/billing/change-plan', { planId })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, changePlanResultSchema)
    return ok(mapChangePlanResult(body))
  }

  async topUpCredits(amountInCents: number, currency?: string): Promise<Result<CheckoutLink, BillingError>> {
    const response = await this.http.post('/api/billing/credits/topup', { amountInCents, currency })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, checkoutLinkSchema)
    return ok(mapCheckoutLink(body))
  }

  async donateCoffee(amountInCents: number, currency?: string): Promise<Result<DonationLink, BillingError>> {
    const response = await this.http.post('/api/billing/donations/coffee', { amountInCents, currency })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = await parseJson(response, donationLinkSchema)
    return ok(mapDonationLink(body))
  }

  private async parseError(response: Response): Promise<BillingError> {
    const body = await parseErrorBody(response)
    return mapBillingError(body?.error ?? 'UNKNOWN_ERROR', body?.message)
  }
}
