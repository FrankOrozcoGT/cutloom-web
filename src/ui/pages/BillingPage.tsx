import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Plan, Subscription } from '@domain/billing'
import { useAuth } from '@ui/auth/useAuth'
import { Button } from '@ui/components/Button'
import { billingApi } from '@ui/billing/composition'

function formatAmount(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency }).format(amountInCents / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function BillingPage() {
  const { organizationId } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [plansResult, subscriptionResult] = await Promise.all([
      billingApi.getPlans(),
      billingApi.getSubscription(),
    ])
    if (plansResult.ok) setPlans(plansResult.value)
    if (subscriptionResult.ok) setSubscription(subscriptionResult.value)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (organizationId === null) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center text-text-muted">
        Necesitás una organización activa para gestionar la suscripción.
      </div>
    )
  }

  if (isLoading) {
    return <div className="p-6 text-text-muted">Cargando…</div>
  }

  const isPastDue = subscription?.status === 'past_due'
  const changeDisabled = isPastDue || (subscription?.cancelAtPeriodEnd ?? false)

  const handleSubscribe = async (planId: string) => {
    setBusyPlanId(planId)
    setError(null)
    const result = await billingApi.createCheckout(planId)
    if (!result.ok) {
      setError(result.error.message)
      setBusyPlanId(null)
      return
    }
    window.location.href = result.value.checkoutUrl
  }

  const handleChangePlan = async (planId: string) => {
    setBusyPlanId(planId)
    setError(null)
    setMessage(null)
    const result = await billingApi.changePlan(planId)
    if (!result.ok) {
      setError(result.error.message)
      setBusyPlanId(null)
      return
    }
    setMessage(
      `Plan actualizado. Cargo prorrateado: ${formatAmount(result.value.proratedAmountInCents, 'GTQ')}.`,
    )
    setBusyPlanId(null)
    await load()
  }

  const handleCancel = async () => {
    setError(null)
    setMessage(null)
    const result = await billingApi.cancel()
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    if (result.value.cancelAtPeriodEnd) {
      setMessage(`Tu suscripción se cancelará el ${formatDate(result.value.currentPeriodEnd)}. Seguís con acceso hasta entonces.`)
    } else {
      setMessage('Tu suscripción fue cancelada.')
    }
    await load()
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-strong">Suscripción</h1>
        <div className="mt-3 flex items-center gap-3">
          <p className="text-text-muted">
            Plan actual: <span className="text-text-strong">{subscription?.planId ?? 'Gratis'}</span>
          </p>
          {isPastDue && (
            <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">
              Pago pendiente
            </span>
          )}
        </div>
        {subscription?.cancelAtPeriodEnd && (
          <p className="mt-1 text-sm text-text-muted">
            Se cancelará el {formatDate(subscription.currentPeriodEnd)}.
          </p>
        )}
      </div>

      {message && <p className="rounded-lg bg-accent-bg px-3 py-2 text-sm text-accent">{message}</p>}
      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = subscription?.planId === plan.id && subscription.status === 'active'
          return (
            <div key={plan.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6">
              <h3 className="text-lg font-semibold text-text-strong">{plan.name}</h3>
              <p className="text-2xl font-bold text-text-strong">
                {formatAmount(plan.amountInCents, plan.currency)}
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
              {isCurrent ? (
                <span className="mt-2 text-sm text-text-muted">Plan actual</span>
              ) : subscription && subscription.status !== 'inactive' ? (
                <Button
                  className="mt-2"
                  disabled={changeDisabled || busyPlanId === plan.id}
                  onClick={() => handleChangePlan(plan.id)}
                >
                  Cambiar a este plan
                </Button>
              ) : (
                <Button className="mt-2" disabled={busyPlanId === plan.id} onClick={() => handleSubscribe(plan.id)}>
                  Suscribirme
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {subscription && subscription.status !== 'inactive' && !subscription.cancelAtPeriodEnd && (
        <Button variant="secondary" className="w-fit px-6" onClick={handleCancel}>
          Cancelar suscripción
        </Button>
      )}

      <Link to="/billing/credits" className="text-sm text-text-muted hover:text-text-strong hover:underline">
        Ver créditos por uso →
      </Link>
    </div>
  )
}
