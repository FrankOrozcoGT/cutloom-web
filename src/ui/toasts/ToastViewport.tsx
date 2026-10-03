import type { ToastEntry } from './ToastProvider'
import type { ToastVariant } from './toastContext'

interface ToastViewportProps {
  toasts: ToastEntry[]
  onDismiss: (id: number) => void
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  danger: 'border-danger/40 bg-danger-bg text-danger',
  success: 'border-success/40 bg-success-bg text-success',
}

/** Esquina inferior derecha, apilado — mismo z-index que el resto de overlays (modales usan z-50, acá z-[60] para quedar siempre arriba). */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm shadow-medium ${VARIANT_CLASSES[toast.variant]}`}
        >
          <p className="flex-1">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Cerrar notificación"
            className="cursor-pointer text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
