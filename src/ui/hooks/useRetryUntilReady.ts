import { useEffect, useState } from 'react'

const RETRY_DELAYS_MS = [1000, 1500, 2000]

/**
 * Reintenta una operación con delays crecientes hasta que `attempt` reporte
 * `done: true` o se agoten los intentos — mismo patrón de polling que usan
 * BillingResultPage (esperar a que el webhook active la suscripción) y
 * CreditsResultPage (esperar a que el webhook acredite el balance): ambas
 * comparten el timing y la cancelación al desmontar, pero difieren en qué
 * cuenta como "listo" y en qué side-effect corren entre intentos — por eso
 * `attempt` es la única pieza que cada caller define, en vez de forzar un
 * único chequeo genérico que no sirva para ninguno de los dos casos reales.
 */
/**
 * `attempt` es la dependencia real del efecto — el caller debe memoizarla
 * (useCallback) con las dependencias que de verdad hacen falta para su
 * propio chequeo de "listo", en vez de que este hook reciba un array de
 * deps opaco que ningún linter de hooks puede verificar.
 */
export function useRetryUntilReady(enabled: boolean, attempt: () => Promise<{ done: boolean }>) {
  const [isRetrying, setIsRetrying] = useState(enabled)

  useEffect(() => {
    if (!enabled) return
    setIsRetrying(true)

    let cancelled = false

    async function run() {
      for (const delay of [0, ...RETRY_DELAYS_MS]) {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
        if (cancelled) return
        const { done } = await attempt()
        if (cancelled) return
        if (done) break
      }
      if (!cancelled) setIsRetrying(false)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [enabled, attempt])

  return isRetrying
}
