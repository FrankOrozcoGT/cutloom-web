import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Subscription } from '@domain/billing'
import { useAuth } from '@ui/auth/useAuth'
import { Button } from '@ui/components/Button'
import { billingApi } from '@ui/billing/composition'
import { formatPlanAmount } from '@ui/billing/format'
import { PlanCard } from '@ui/billing/PlanCard'
import { usePlans } from '@ui/billing/usePlans'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function BillingPage() {
  const { isAuthenticated, organizationId } = useAuth()
  const { plans, plansLoaded } = usePlans()
  const [searchParams, setSearchParams] = useSearchParams()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)

  const loadSubscription = useCallback(async () => {
    if (!isAuthenticated) return
    const result = await billingApi.getSubscription()
    if (result.ok) setSubscription(result.value)
  }, [isAuthenticated])

  useEffect(() => {
    void loadSubscription()
  }, [loadSubscription])

  const isPastDue = subscription?.status === 'past_due'
  const changeDisabled = isPastDue || (subscription?.cancelAtPeriodEnd ?? false)
  const hasActiveSubscription = !!subscription && subscription.status !== 'inactive'
  const currentPlanName = plans.find((plan) => plan.id === subscription?.planId)?.name ?? 'Gratis'

  const handleSubscribe = useCallback(async (planId: string) => {
    setBusyPlanId(planId)
    setError(null)
    const result = await billingApi.createCheckout(planId)
    if (!result.ok) {
      setError(result.error.message)
      setBusyPlanId(null)
      return
    }
    window.location.href = result.value.checkoutUrl
  }, [])

  // Si el usuario eligió un plan antes de loguearse/registrarse (link
  // "Comenzar" desde una tarjeta específica), retomamos esa intención acá en
  // vez de forzarlo a elegir el plan de nuevo — el flujo completo (elegir
  // plan → login/registro → checkout) queda en un solo paso para el usuario.
  useEffect(() => {
    const pendingPlanId = searchParams.get('plan')
    if (!pendingPlanId || !isAuthenticated || !plansLoaded || hasActiveSubscription) return
    if (!plans.some((plan) => plan.id === pendingPlanId)) return

    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('plan')
      return next
    }, { replace: true })
    void handleSubscribe(pendingPlanId)
  }, [searchParams, isAuthenticated, plansLoaded, hasActiveSubscription, plans, handleSubscribe, setSearchParams])

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
      `Plan actualizado. Cargo prorrateado: ${formatPlanAmount(result.value.proratedAmountInCents, 'GTQ')}.`,
    )
    setBusyPlanId(null)
    await loadSubscription()
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
    await loadSubscription()
  }

  if (!plansLoaded) {
    return <div className="p-6 text-text-muted">Cargando…</div>
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-strong">Suscripción</h1>
        {isAuthenticated && (
          <>
            <div className="mt-3 flex items-center gap-3">
              <p className="text-text-muted">
                Plan actual: <span className="text-text-strong">{currentPlanName}</span>
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
          </>
        )}
      </div>

      {message && <p className="rounded-lg bg-accent-bg px-3 py-2 text-sm text-accent">{message}</p>}
      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = isAuthenticated && subscription?.planId === plan.id && subscription.status === 'active'

          let footer: ReactNode
          if (isCurrent) {
            footer = <span className="mt-2 text-sm text-text-muted">Plan actual</span>
          } else if (!isAuthenticated) {
            const returnTo = encodeURIComponent(`/billing?plan=${plan.id}`)
            footer = (
              <Link to={`/register?returnTo=${returnTo}`}>
                <Button className="mt-2">Comenzar</Button>
              </Link>
            )
          } else {
            const label = hasActiveSubscription ? 'Cambiar a este plan' : 'Suscribirme'
            const disabled = (hasActiveSubscription && changeDisabled) || busyPlanId === plan.id
            const onClick = () => (hasActiveSubscription ? handleChangePlan(plan.id) : handleSubscribe(plan.id))
            footer = (
              <Button className="mt-2" disabled={disabled} onClick={onClick}>
                {label}
              </Button>
            )
          }
          return <PlanCard key={plan.id} plan={plan} footer={footer} />
        })}
      </div>

      {isAuthenticated && organizationId && hasActiveSubscription && !subscription?.cancelAtPeriodEnd && (
        <Button variant="secondary" className="w-fit px-6" onClick={handleCancel}>
          Cancelar suscripción
        </Button>
      )}

      {isAuthenticated && (
        <Link to="/billing/credits" className="text-sm text-text-muted hover:text-text-strong hover:underline">
          Ver créditos por uso →
        </Link>
      )}
    </div>
  )
}
