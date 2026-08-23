import { useCallback, useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { billingApi } from '@ui/billing/composition'

const PRESET_AMOUNTS_QTZ = [5, 10, 25, 50]

export function CreditsPage() {
  const [balance, setBalance] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [selectedAmount, setSelectedAmount] = useState<number>(PRESET_AMOUNTS_QTZ[0])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBalance = useCallback(async () => {
    const result = await billingApi.getCreditsBalance()
    if (result.ok) setBalance(result.value.balance)
  }, [])

  useEffect(() => {
    void loadBalance()
  }, [loadBalance])

  const effectiveAmountQtz = customAmount.trim() ? Number(customAmount) : selectedAmount

  const handleTopUp = async () => {
    if (!Number.isFinite(effectiveAmountQtz) || effectiveAmountQtz < 5) {
      setError('El monto mínimo es Q5.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    const amountInCents = Math.round(effectiveAmountQtz * 100)
    const result = await billingApi.topUpCredits(amountInCents)
    if (!result.ok) {
      setError(result.error.message)
      setIsSubmitting(false)
      return
    }
    window.location.href = result.value.checkoutUrl
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text-strong">Créditos por uso</h1>
      <p className="text-text-muted">
        Balance actual: <span className="text-text-strong">{balance === null ? '—' : `Q${(balance / 100).toFixed(2)}`}</span>
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium text-text-strong">Recargar créditos</h2>
        <div className="flex gap-2">
          {PRESET_AMOUNTS_QTZ.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => {
                setSelectedAmount(amount)
                setCustomAmount('')
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                !customAmount.trim() && selectedAmount === amount
                  ? 'border-accent-border bg-accent-bg text-accent'
                  : 'border-border text-text-strong hover:bg-surface-hover'
              }`}
            >
              Q{amount}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={5}
          placeholder="Otro monto (GTQ)"
          value={customAmount}
          onChange={(event) => setCustomAmount(event.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-text-strong outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-bg"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={handleTopUp} disabled={isSubmitting}>
          {isSubmitting ? 'Redirigiendo…' : 'Recargar'}
        </Button>
      </div>
    </div>
  )
}
