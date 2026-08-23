import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { billingApi } from './composition'

const PRESET_AMOUNTS_QTZ = [10, 20, 40]
const RECOMMENDED_AMOUNT_QTZ = 20

interface CoffeeDonationProps {
  onClose: () => void
}

export function CoffeeDonation({ onClose }: CoffeeDonationProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(RECOMMENDED_AMOUNT_QTZ)
  const [customAmount, setCustomAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveAmountQtz = customAmount.trim() ? Number(customAmount) : selectedAmount

  const handleDonate = async () => {
    if (!Number.isFinite(effectiveAmountQtz) || effectiveAmountQtz < 10) {
      setError('El monto mínimo es Q10.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    const amountInCents = Math.round(effectiveAmountQtz * 100)
    const result = await billingApi.donateCoffee(amountInCents)
    if (!result.ok) {
      setError(result.error.message)
      setIsSubmitting(false)
      return
    }
    window.location.href = result.value.donationUrl
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-strong">Invitar un café ☕</h2>
        <p className="mt-1 text-sm text-text-muted">
          Si CutLoom te resultó útil, podés apoyar el proyecto con una donación.
        </p>

        <div className="mt-4 flex items-stretch gap-2">
          {PRESET_AMOUNTS_QTZ.map((amount) => {
            const isRecommended = amount === RECOMMENDED_AMOUNT_QTZ
            const isSelected = !customAmount.trim() && selectedAmount === amount
            return (
              <button
                key={amount}
                type="button"
                onClick={() => {
                  setSelectedAmount(amount)
                  setCustomAmount('')
                }}
                className={`relative flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? 'border-accent-border bg-accent-bg text-accent'
                    : isRecommended
                      ? 'border-accent-border text-text-strong hover:bg-surface-hover'
                      : 'border-border text-text-strong hover:bg-surface-hover'
                }`}
              >
                {isRecommended && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-accent px-1.5 text-[10px] font-medium text-bg">
                    Popular
                  </span>
                )}
                Q{amount}
              </button>
            )
          })}
        </div>

        <div className="mt-3">
          <input
            type="number"
            min={10}
            placeholder="Otro monto (GTQ)"
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-text-strong outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-bg"
          />
        </div>

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleDonate} disabled={isSubmitting}>
            {isSubmitting ? 'Redirigiendo…' : 'Donar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
