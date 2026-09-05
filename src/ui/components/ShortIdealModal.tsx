import { useCallback, useEffect, useState } from 'react'
import type { ShortIdeal } from '@domain/shorts'
import type { CreateShortsState } from '@ui/hooks/useShorts'
import { Button } from '@ui/components/Button'

function createShortsButtonLabel(state: CreateShortsState): string {
  if (state === 'detecting') return 'Detectando candidatos…'
  if (state === 'extracting_audio') return 'Extrayendo audio…'
  if (state === 'scoring') return 'Calculando score…'
  return 'Crear shorts'
}

interface ShortIdealModalProps {
  state: CreateShortsState
  onCreateShorts: (shortIdeal?: ShortIdeal) => void
  onClose: () => void
}

/** undefined/'' se tratan igual que "sin preferencia" — el backend aplica sus propios defaults cuando el campo falta. */
function toShortIdeal(form: {
  topic: string
  targetAudience: string
  targetDurationSeconds: string
  tone: string
  count: string
}): ShortIdeal | undefined {
  const ideal: ShortIdeal = {}
  if (form.topic.trim()) ideal.topic = form.topic.trim()
  if (form.targetAudience.trim()) ideal.targetAudience = form.targetAudience.trim()
  if (form.tone.trim()) ideal.tone = form.tone.trim()
  const duration = Number(form.targetDurationSeconds)
  if (form.targetDurationSeconds.trim() && Number.isFinite(duration) && duration > 0) {
    ideal.targetDurationSeconds = duration
  }
  const count = Number(form.count)
  if (form.count.trim() && Number.isFinite(count) && count > 0) {
    ideal.count = Math.round(count)
  }
  return Object.keys(ideal).length > 0 ? ideal : undefined
}

/** Mismo patrón de overlay que EditDescriptionDialog — el formulario de preferencias no necesita ocupar espacio permanente en la pantalla de shorts. */
export function ShortIdealModal({ state, onCreateShorts, onClose }: ShortIdealModalProps) {
  const [topic, setTopic] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [targetDurationSeconds, setTargetDurationSeconds] = useState('')
  const [tone, setTone] = useState('')
  const [count, setCount] = useState('')
  const isCreating = state === 'detecting' || state === 'extracting_audio' || state === 'scoring'

  const handleCreateShorts = useCallback(() => {
    onCreateShorts(toShortIdeal({ topic, targetAudience, targetDurationSeconds, tone, count }))
    onClose()
  }, [onCreateShorts, onClose, topic, targetAudience, targetDurationSeconds, tone, count])

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
        role="dialog"
        aria-modal="true"
        aria-label="Crear shorts"
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-strong">Crear shorts</h2>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Tema (opcional)
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="¿De qué debe tratar el short?"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none placeholder:text-text-muted"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Audiencia objetivo (opcional)
            <input
              value={targetAudience}
              onChange={(event) => setTargetAudience(event.target.value)}
              placeholder="¿A quién apunta?"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none placeholder:text-text-muted"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Tono (opcional)
            <input
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              placeholder="Si se omite, la IA lo detecta del contenido"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none placeholder:text-text-muted"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Duración por short en segundos (opcional)
            <input
              type="number"
              min={1}
              value={targetDurationSeconds}
              onChange={(event) => setTargetDurationSeconds(event.target.value)}
              placeholder="Por defecto 45"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none placeholder:text-text-muted"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Cantidad de candidatos (opcional)
            <input
              type="number"
              min={1}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              placeholder="Por defecto 8"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none placeholder:text-text-muted"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreateShorts} disabled={isCreating}>
            {createShortsButtonLabel(state)}
          </Button>
        </div>
      </div>
    </div>
  )
}
