import { useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'

interface EditDescriptionDialogProps {
  title: string
  initialValue: string
  onSave: (value: string) => void
  onCancel: () => void
}

/** Mismo patrón de overlay que ConfirmDialog, con un textarea en vez de un mensaje — para editar texto libre sin ocupar espacio permanente en el listado. */
export function EditDescriptionDialog({ title, initialValue, onSave, onCancel }: EditDescriptionDialogProps) {
  const [value, setValue] = useState(initialValue)

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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-strong">{title}</h2>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={4}
          autoFocus
          className="mt-3 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-strong outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-bg"
        />

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(value.trim())}>Guardar</Button>
        </div>
      </div>
    </div>
  )
}
