import type { ChangePlanResult, CheckoutLink, CreditBalance, DonationLink, Plan, Subscription } from '@domain/billing'
import type { BillingApi } from '@application/billing/ports'
import { BillingError } from '@application/billing/errors'
import { err, ok, type Result } from '@application/result'
import type { HttpClient } from '@infrastructure/http/client'
import {
  mapBillingError,
  mapChangePlanResult,
  mapCheckoutLink,
  mapCreditBalance,
  mapDonationLink,
  mapPlan,
  mapSubscription,
  type CancelSubscriptionResultDto,
  type ChangePlanResultDto,
  type CheckoutLinkDto,
  type CreditBalanceDto,
  type DonationLinkDto,
  type PlanDto,
  type SubscriptionDto,
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
    const body = (await response.json()) as { plans: PlanDto[] }
    return ok(body.plans.map(mapPlan))
  }

  async getSubscription(): Promise<Result<Subscription | null, BillingError>> {
    const response = await this.http.get('/api/billing/subscription')
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as { subscription: SubscriptionDto | null }
    return ok(body.subscription ? mapSubscription(body.subscription) : null)
  }

  async getCreditsBalance(): Promise<Result<CreditBalance, BillingError>> {
    const response = await this.http.get('/api/billing/credits/balance')
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as CreditBalanceDto
    return ok(mapCreditBalance(body))
  }

  async createCheckout(planId: string): Promise<Result<CheckoutLink, BillingError>> {
    const response = await this.http.post('/api/billing/checkout', { planId })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as CheckoutLinkDto
    return ok(mapCheckoutLink(body))
  }

  async cancel(): Promise<Result<CancelSubscriptionResultDto, BillingError>> {
    const response = await this.http.post('/api/billing/cancel')
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as CancelSubscriptionResultDto
    return ok(body)
  }

  async changePlan(planId: string): Promise<Result<ChangePlanResult, BillingError>> {
    const response = await this.http.post('/api/billing/change-plan', { planId })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as ChangePlanResultDto
    return ok(mapChangePlanResult(body))
  }

  async topUpCredits(amountInCents: number, currency?: string): Promise<Result<CheckoutLink, BillingError>> {
    const response = await this.http.post('/api/billing/credits/topup', { amountInCents, currency })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as CheckoutLinkDto
    return ok(mapCheckoutLink(body))
  }

  async donateCoffee(amountInCents: number, currency?: string): Promise<Result<DonationLink, BillingError>> {
    const response = await this.http.post('/api/billing/donations/coffee', { amountInCents, currency })
    if (!response.ok) {
      return err(await this.parseError(response))
    }
    const body = (await response.json()) as DonationLinkDto
    return ok(mapDonationLink(body))
  }

  private async parseError(response: Response): Promise<BillingError> {
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      return mapBillingError(body.error ?? 'UNKNOWN_ERROR', body.message)
    } catch {
      return mapBillingError('UNKNOWN_ERROR')
    }
  }
}
