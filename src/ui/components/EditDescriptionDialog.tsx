import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { Modal } from '@ui/components/Modal'

interface EditDescriptionDialogProps {
  title: string
  initialValue: string
  onSave: (value: string) => void
  onCancel: () => void
}

/** Textarea de texto libre para editar la descripción de un proyecto, sin ocupar espacio permanente en el listado. */
export function EditDescriptionDialog({ title, initialValue, onSave, onCancel }: EditDescriptionDialogProps) {
  const [value, setValue] = useState(initialValue)

  return (
    <Modal title={title} maxWidth="md" onClose={onCancel}>
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
    </Modal>
  )
}
