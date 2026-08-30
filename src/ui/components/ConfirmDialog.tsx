import { useEffect } from 'react'
import { Button } from '@ui/components/Button'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Marca la acción como destructiva (botón confirmar en rojo). */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Diálogo de confirmación global de la app — reemplazo de window.confirm,
 * con el mismo patrón de overlay que el resto de modales (CoffeeDonation).
 * Se cierra con Escape o clic en el overlay (equivale a cancelar).
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-strong">{title}</h2>
        <p className="mt-1 text-sm text-text-muted">{message}</p>

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={onCancel} autoFocus>
            {cancelLabel}
          </Button>
          {danger ? (
            <button
              type="button"
              onClick={onConfirm}
              className="w-full rounded-lg bg-danger px-4 py-2.5 text-sm font-medium text-bg transition-colors hover:opacity-90"
            >
              {confirmLabel}
            </button>
          ) : (
            <Button onClick={onConfirm}>{confirmLabel}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
