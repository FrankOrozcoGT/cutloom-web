import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { billingApi } from '@ui/billing/composition'
import { useRetryUntilReady } from '@ui/hooks/useRetryUntilReady'

interface BillingResultPageProps {
  result: 'success' | 'cancel'
}

export function BillingResultPage({ result }: BillingResultPageProps) {
  const { refreshEntitlements } = useAuth()

  const attempt = useCallback(async () => {
    const subscriptionResult = await billingApi.getSubscription()
    if (subscriptionResult.ok && subscriptionResult.value?.status === 'active') {
      return { done: true }
    }
    // El webhook puede tardar en llegar — refresca entitlements/plan para
    // el próximo intento sin volver a tocar el refresh token.
    await refreshEntitlements()
    return { done: false }
  }, [refreshEntitlements])

  const isRefetching = useRetryUntilReady(result === 'success', attempt)

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 py-16 text-center">
      {result === 'success' ? (
        <>
          <h1 className="text-2xl font-semibold text-text-strong">
            {isRefetching ? 'Confirmando tu pago…' : '¡Listo!'}
          </h1>
          <p className="text-text-muted">
            {isRefetching
              ? 'Estamos sincronizando tu suscripción, puede tardar unos segundos.'
              : 'Tu suscripción fue activada.'}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-text-strong">Pago cancelado</h1>
          <p className="text-text-muted">No se realizó ningún cargo.</p>
        </>
      )}
      <Link to="/billing" className="text-sm text-accent hover:underline">
        Volver a suscripción
      </Link>
    </div>
  )
}
