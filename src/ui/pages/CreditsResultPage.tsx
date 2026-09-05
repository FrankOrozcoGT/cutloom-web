import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { billingApi } from '@ui/billing/composition'
import { useRetryUntilReady } from '@ui/hooks/useRetryUntilReady'

interface CreditsResultPageProps {
  result: 'success' | 'cancel'
}

export function CreditsResultPage({ result }: CreditsResultPageProps) {
  const [balance, setBalance] = useState<number | null>(null)
  // Primera lectura de balance dentro de este ciclo de reintentos — vive en
  // un ref (no en useRetryUntilReady) porque es un detalle de "qué significa
  // estar listo" específico de este flujo, no algo que el hook genérico deba
  // conocer.
  const baselineRef = useRef<number | null>(null)

  const attempt = useCallback(async () => {
    const balanceResult = await billingApi.getCreditsBalance()
    if (!balanceResult.ok) {
      return { done: false }
    }
    setBalance(balanceResult.value.balance)
    if (baselineRef.current === null) {
      baselineRef.current = balanceResult.value.balance
      return { done: false }
    }
    // El webhook ya sumó los créditos — el balance cambió respecto a la
    // primera lectura.
    return { done: balanceResult.value.balance !== baselineRef.current }
  }, [])

  const isRefetching = useRetryUntilReady(result === 'success', attempt)

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 py-16 text-center">
      {result === 'success' ? (
        <>
          <h1 className="text-2xl font-semibold text-text-strong">
            {isRefetching ? 'Confirmando tu recarga…' : '¡Créditos recargados!'}
          </h1>
          <p className="text-text-muted">
            {balance === null ? 'Confirmando tu balance…' : `Balance actual: Q${(balance / 100).toFixed(2)}`}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-text-strong">Recarga cancelada</h1>
          <p className="text-text-muted">No se realizó ningún cargo.</p>
        </>
      )}
      <Link to="/billing/credits" className="text-sm text-accent hover:underline">
        Volver a créditos
      </Link>
    </div>
  )
}
