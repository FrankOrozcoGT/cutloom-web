import { useCallback, useState } from 'react'
import type { ShortScore } from '@domain/shorts'
import type { ShortsErrorCode } from '@application/shorts/errors'
import type { CreateShortsState } from '@ui/hooks/useShorts'
import { Button } from '@ui/components/Button'
import { PremiumNotice } from '@ui/billing/PremiumNotice'
import { SHORTS_ERROR_MESSAGES } from '@ui/shorts/errorMessages'

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
  onCreateShorts: (ideal?: string) => void
}

export function CreateShortsTool({ hasAccess, hasSubtitles, state, error, shorts, warnings, onCreateShorts }: CreateShortsToolProps) {
  const [ideal, setIdeal] = useState('')
  const isCreating = state === 'detecting' || state === 'extracting_audio' || state === 'scoring'
  const handleCreateShorts = useCallback(() => onCreateShorts(ideal.trim() || undefined), [onCreateShorts, ideal])

  if (!hasSubtitles) {
    return <p className="text-sm text-text-muted">Genera subtítulos primero para crear shorts.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {!hasAccess && <PremiumNotice />}

      <textarea
        value={ideal}
        onChange={(event) => setIdeal(event.target.value)}
        placeholder="Describe el short ideal (opcional)…"
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-strong outline-none placeholder:text-text-muted"
      />
      <Button onClick={handleCreateShorts} disabled={isCreating || !hasAccess} className="w-auto">
        {createShortsButtonLabel(state)}
      </Button>

      {state === 'error' && error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {SHORTS_ERROR_MESSAGES[error]}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">{warnings.join(' · ')}</div>
      )}

      {shorts.length > 0 && (
        <div className="flex flex-col gap-2">
          {shorts.map((short, index) => (
            <div key={`${short.startMs}-${index}`} className="flex flex-col gap-1 rounded-md border border-border p-2 text-xs">
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
