import type { ReactNode } from 'react'
import type { Plan } from '@domain/billing'
import { formatPlanAmount } from './format'

interface PlanCardProps {
  plan: Plan
  footer: ReactNode
}

export function PlanCard({ plan, footer }: PlanCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6">
      <h3 className="text-lg font-semibold text-text-strong">{plan.name}</h3>
      <p className="text-2xl font-bold text-text-strong">
        {formatPlanAmount(plan.amountInCents, plan.currency)}
        <span className="text-sm font-normal text-text-muted"> / {plan.interval}</span>
      </p>
      <ul className="flex flex-col gap-1 text-sm text-text-muted">
        {plan.features.map((feature) => (
          <li key={feature.feature}>
            • {feature.feature}
            {feature.usageLimit !== null && ` (${feature.usageLimit}/mes)`}
          </li>
        ))}
      </ul>
      {footer}
    </div>
  )
}
