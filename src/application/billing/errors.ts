export type BillingErrorCode =
  | 'MISSING_ORGANIZATION'
  | 'PLAN_NOT_FOUND'
  | 'NO_ACTIVE_SUBSCRIPTION'
  | 'SUBSCRIPTION_NOT_ELIGIBLE'
  | 'INVALID_TOPUP_AMOUNT'
  | 'INVALID_DONATION_AMOUNT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export class BillingError extends Error {
  readonly code: BillingErrorCode

  constructor(code: BillingErrorCode, message: string) {
    super(message)
    this.name = 'BillingError'
    this.code = code
  }
}
