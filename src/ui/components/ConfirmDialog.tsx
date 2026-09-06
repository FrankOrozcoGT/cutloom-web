import { Button } from '@ui/components/Button'
import { Modal } from '@ui/components/Modal'

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

/** Diálogo de confirmación global de la app — reemplazo de window.confirm. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} role="alertdialog" maxWidth="sm" onClose={onCancel}>
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
    </Modal>
  )
}
