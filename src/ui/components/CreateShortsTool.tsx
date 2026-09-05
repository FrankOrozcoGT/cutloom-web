import { useCallback, useState } from 'react'
import type { ShortIdeal, ShortScore } from '@domain/shorts'
import type { ShortsErrorCode } from '@application/shorts/errors'
import type { CreateShortsState } from '@ui/hooks/useShorts'
import { Button } from '@ui/components/Button'
import { PremiumNotice } from '@ui/billing/PremiumNotice'
import { describeShortsWarning, SHORTS_ERROR_MESSAGES } from '@ui/shorts/errorMessages'

function createShortsButtonLabel(state: CreateShortsState): string {
  if (state === 'detecting') return 'Detectando candidatos…'
  if (state === 'extracting_audio') return 'Extrayendo audio…'
  if (state === 'scoring') return 'Calculando score…'
  return 'Crear shorts'
}

interface CreateShortsToolProps {
  hasAccess: boolean
  hasSubtitles: boolean
  state: CreateShortsState
  error: ShortsErrorCode | null
  shorts: ShortScore[]
  warnings: string[]
  isStale: boolean
  onCreateShorts: (shortIdeal?: ShortIdeal) => void
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

export function CreateShortsTool({
  hasAccess,
  hasSubtitles,
  state,
  error,
  shorts,
  warnings,
  isStale,
  onCreateShorts,
}: CreateShortsToolProps) {
  const [topic, setTopic] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [targetDurationSeconds, setTargetDurationSeconds] = useState('')
  const [tone, setTone] = useState('')
  const [count, setCount] = useState('')
  const isCreating = state === 'detecting' || state === 'extracting_audio' || state === 'scoring'

  const handleCreateShorts = useCallback(
    () => onCreateShorts(toShortIdeal({ topic, targetAudience, targetDurationSeconds, tone, count })),
    [onCreateShorts, topic, targetAudience, targetDurationSeconds, tone, count],
  )

  if (!hasSubtitles) {
    return <p className="text-sm text-text-muted">Genera subtítulos primero para crear shorts.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {!hasAccess && <PremiumNotice />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <Button onClick={handleCreateShorts} disabled={isCreating || !hasAccess} className="w-auto">
        {createShortsButtonLabel(state)}
      </Button>

      {state === 'error' && error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {SHORTS_ERROR_MESSAGES[error]}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">
          {warnings.map(describeShortsWarning).join(' · ')}
        </div>
      )}

      {isStale && shorts.length > 0 && (
        <div className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">
          Estos shorts se generaron con una versión anterior del timeline — los tiempos pueden ya no corresponder al contenido actual. Genera de nuevo para actualizarlos.
        </div>
      )}

      {shorts.length > 0 && (
        <div className="flex flex-col gap-2">
          {shorts.map((short, index) => (
            <div key={`${short.startMs}-${index}`} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
              <span className="font-medium text-text-strong">
                {(short.startMs / 1000).toFixed(1)}s – {(short.endMs / 1000).toFixed(1)}s · score {short.score.toFixed(2)}
              </span>
              {short.emotion && <span className="text-text-muted">Emoción: {short.emotion}</span>}
              <span className="text-text-muted">{short.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
