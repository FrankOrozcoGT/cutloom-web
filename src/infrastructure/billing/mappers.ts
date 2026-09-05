import type { ChangePlanResult, Plan, PlanFeature, Subscription, SubscriptionStatus } from '@domain/billing'
import type { BillingErrorCode } from '@application/billing/errors'
import { BillingError } from '@application/billing/errors'
import { mapKnownError } from '@infrastructure/errors'

export interface PlanFeatureDto {
  feature: string
  usageLimit: number | null
}

export interface PlanDto {
  id: string
  name: string
  amountInCents: number
  currency: string
  interval: string
  features: PlanFeatureDto[]
}

export interface SubscriptionDto {
  planId: string | null
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

export interface ChangePlanResultDto {
  status: SubscriptionStatus
  planId: string
  currentPeriodStart: string
  currentPeriodEnd: string
  proratedAmountInCents: number
}

export function mapPlanFeature(dto: PlanFeatureDto): PlanFeature {
  return {
    feature: dto.feature,
    usageLimit: dto.usageLimit,
  }
}

export function mapPlan(dto: PlanDto): Plan {
  return {
    id: dto.id,
    name: dto.name,
    amountInCents: dto.amountInCents,
    currency: dto.currency,
    interval: dto.interval,
    features: dto.features.map(mapPlanFeature),
  }
}

export function mapSubscription(dto: SubscriptionDto): Subscription {
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
