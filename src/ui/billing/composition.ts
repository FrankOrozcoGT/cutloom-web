import { BillingApiAdapter } from '@infrastructure/billing/adapter'
import { httpClient } from '@infrastructure/http/client'

export const billingApi = new BillingApiAdapter(httpClient)
