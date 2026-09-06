import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  /** 'alertdialog' para confirmaciones/acciones destructivas, 'dialog' para el resto (formularios, edición de texto). */
  role?: 'dialog' | 'alertdialog'
  maxWidth?: 'sm' | 'md' | 'lg'
  onClose: () => void
  children: ReactNode
}

const MAX_WIDTH_CLASSES: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

/**
 * Overlay base compartido por todos los modales de la app (antes
 * reimplementado por separado en ConfirmDialog, EditDescriptionDialog y
 * ShortIdealModal) — fixed/backdrop, cierre con Escape o clic en el
 * overlay, stopPropagation en el contenido para que ese clic no cierre el
 * modal. Cada modal específico solo aporta su contenido como children.
 */
export function Modal({ title, role = 'dialog', maxWidth = 'md', onClose, children }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role={role}
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-xl border border-border bg-surface p-6 ${MAX_WIDTH_CLASSES[maxWidth]}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
