import { z } from 'zod'
import type {
  CancelSubscriptionResult,
  ChangePlanResult,
  CheckoutLink,
  CreditBalance,
  DonationLink,
  Plan,
  PlanFeature,
  Subscription,
} from '@domain/billing'
import type { BillingErrorCode } from '@application/billing/errors'
import { BillingError } from '@application/billing/errors'
import { mapKnownError } from '@infrastructure/errors'

const subscriptionStatusSchema = z.enum(['active', 'past_due', 'inactive'])

const planFeatureSchema = z.object({
  feature: z.string(),
  usageLimit: z.number().nullable(),
})

const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  amountInCents: z.number(),
  currency: z.string(),
  interval: z.string(),
  features: z.array(planFeatureSchema),
})

export const plansResponseSchema = z.object({ plans: z.array(planSchema) })

const subscriptionSchema = z.object({
  planId: z.string().nullable(),
  status: subscriptionStatusSchema,
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
})

export const subscriptionResponseSchema = z.object({ subscription: subscriptionSchema.nullable() })

export const changePlanResultSchema = z.object({
  status: subscriptionStatusSchema,
  planId: z.string(),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  proratedAmountInCents: z.number(),
})
export type ChangePlanResultDto = z.infer<typeof changePlanResultSchema>

export const creditBalanceSchema = z.object({ balance: z.number() })
export type CreditBalanceDto = z.infer<typeof creditBalanceSchema>

export const checkoutLinkSchema = z.object({ checkoutUrl: z.string() })
export type CheckoutLinkDto = z.infer<typeof checkoutLinkSchema>

export const donationLinkSchema = z.object({ donationUrl: z.string() })
export type DonationLinkDto = z.infer<typeof donationLinkSchema>

export const cancelSubscriptionResultSchema = z.object({
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.string(),
})
export type CancelSubscriptionResultDto = z.infer<typeof cancelSubscriptionResultSchema>

export function mapPlanFeature(dto: z.infer<typeof planFeatureSchema>): PlanFeature {
  return {
    feature: dto.feature,
    usageLimit: dto.usageLimit,
  }
}

export function mapPlan(dto: z.infer<typeof planSchema>): Plan {
  return {
    id: dto.id,
    name: dto.name,
    amountInCents: dto.amountInCents,
    currency: dto.currency,
    interval: dto.interval,
    features: dto.features.map(mapPlanFeature),
  }
}

export function mapSubscription(dto: z.infer<typeof subscriptionSchema>): Subscription {
  return {
    planId: dto.planId,
    status: dto.status,
    currentPeriodStart: dto.currentPeriodStart,
    currentPeriodEnd: dto.currentPeriodEnd,
    cancelAtPeriodEnd: dto.cancelAtPeriodEnd,
  }
}

export function mapChangePlanResult(dto: ChangePlanResultDto): ChangePlanResult {
  return {
    status: dto.status,
    planId: dto.planId,
    currentPeriodStart: dto.currentPeriodStart,
    currentPeriodEnd: dto.currentPeriodEnd,
    proratedAmountInCents: dto.proratedAmountInCents,
  }
}

export function mapCreditBalance(dto: CreditBalanceDto): CreditBalance {
  return { balance: dto.balance }
}

export function mapCheckoutLink(dto: CheckoutLinkDto): CheckoutLink {
  return { checkoutUrl: dto.checkoutUrl }
}

export function mapDonationLink(dto: DonationLinkDto): DonationLink {
  return { donationUrl: dto.donationUrl }
}

export function mapCancelSubscriptionResult(dto: CancelSubscriptionResultDto): CancelSubscriptionResult {
  return { cancelAtPeriodEnd: dto.cancelAtPeriodEnd, currentPeriodEnd: dto.currentPeriodEnd }
}

const KNOWN_ERROR_CODES: readonly BillingErrorCode[] = [
  'MISSING_ORGANIZATION',
  'PLAN_NOT_FOUND',
  'NO_ACTIVE_SUBSCRIPTION',
  'SUBSCRIPTION_NOT_ELIGIBLE',
  'INVALID_TOPUP_AMOUNT',
  'INVALID_DONATION_AMOUNT',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
]

export function mapBillingError(code: string, message?: string): BillingError {
  return mapKnownError(KNOWN_ERROR_CODES, (c, m) => new BillingError(c, m), code, message)
}
