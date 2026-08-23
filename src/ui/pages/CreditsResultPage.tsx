import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { billingApi } from '@ui/billing/composition'

const RETRY_DELAYS_MS = [1000, 1500, 2000]

interface CreditsResultPageProps {
  result: 'success' | 'cancel'
}

export function CreditsResultPage({ result }: CreditsResultPageProps) {
  const [balance, setBalance] = useState<number | null>(null)
  const [isRefetching, setIsRefetching] = useState(result === 'success')

  useEffect(() => {
    if (result !== 'success') return

    let cancelled = false

    async function refetchWithRetry() {
      let baseline: number | null = null
      for (const delay of [0, ...RETRY_DELAYS_MS]) {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
        if (cancelled) return
        const balanceResult = await billingApi.getCreditsBalance()
        if (cancelled) return
        if (balanceResult.ok) {
          setBalance(balanceResult.value.balance)
          if (baseline === null) {
            baseline = balanceResult.value.balance
          } else if (balanceResult.value.balance !== baseline) {
            // El webhook ya sumó los créditos — el balance cambió respecto
            // a la primera lectura.
            break
          }
        }
      }
      if (!cancelled) setIsRefetching(false)
    }

    void refetchWithRetry()
    return () => {
      cancelled = true
    }
  }, [result])

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
