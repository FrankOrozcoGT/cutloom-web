import { useCallback, useState } from 'react'
import type { MetadataWizardInput } from '@ui/hooks/usePublishYouTube'
import { Button } from '@ui/components/Button'
import { Modal } from '@ui/components/Modal'

interface GenerateMetadataModalProps {
  onGenerate: (input: MetadataWizardInput) => void
  onClose: () => void
}

/** Mismo patrón de overlay que ShortIdealModal — el formulario de topic/tone/instrucciones no necesita ocupar espacio permanente en la pantalla de publicación. */
export function GenerateMetadataModal({ onGenerate, onClose }: GenerateMetadataModalProps) {
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('')
  const [additionalInstructions, setAdditionalInstructions] = useState('')

  const handleGenerate = useCallback(() => {
    onGenerate({ topic, tone, additionalInstructions })
    onClose()
  }, [onGenerate, onClose, topic, tone, additionalInstructions])

  return (
    <Modal title="Generar metadatos con IA" maxWidth="lg" onClose={onClose}>
      <h2 className="text-lg font-semibold text-text-strong">Generar metadatos con IA</h2>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Tema (opcional)
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Si se omite, la IA lo infiere del contenido del video"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none placeholder:text-text-muted"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Tono (opcional)
          <input
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            placeholder="Si se omite, la IA lo infiere del contenido"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none placeholder:text-text-muted"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Instrucciones adicionales (opcional)
          <textarea
            value={additionalInstructions}
            onChange={(event) => setAdditionalInstructions(event.target.value)}
            placeholder="Cualquier otra indicación para la IA"
            className="rounded-lg border border-border bg-bg p-2 text-text-strong outline-none placeholder:text-text-muted"
          />
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleGenerate}>Generar metadatos</Button>
      </div>
    </Modal>
  )
}
