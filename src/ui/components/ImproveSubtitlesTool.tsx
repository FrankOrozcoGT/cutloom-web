import { useCallback } from 'react'
import type { ShortsErrorCode } from '@application/shorts/errors'
import type { ImproveSubtitlesState } from '@ui/hooks/useShorts'
import { BlockingLoader } from '@ui/components/BlockingLoader'
import { Button } from '@ui/components/Button'
import { PremiumNotice } from '@ui/billing/PremiumNotice'
import { SHORTS_ERROR_MESSAGES } from '@ui/shorts/errorMessages'

function improveButtonLabel(state: ImproveSubtitlesState): string {
  if (state === 'loading') return 'Mejorando subtítulos…'
  return 'Mejorar subtítulos'
}

interface ImproveSubtitlesToolProps {
  hasAccess: boolean
  hasSubtitles: boolean
  state: ImproveSubtitlesState
  error: ShortsErrorCode | null
  onImprove: (userContext?: string) => void
}

/**
 * El resultado de la mejora se aplica directo a los segmentos del timeline
 * (ver EditorPage) en vez de mostrarse acá para aprobar uno por uno — el
 * diff (tachado/nuevo) y el revertir puntual viven en SubtitleSegmentList,
 * junto al resto de la edición de subtítulos.
 */
export function ImproveSubtitlesTool({ hasAccess, hasSubtitles, state, error, onImprove }: ImproveSubtitlesToolProps) {
  const isImproving = state === 'loading'
  const handleImprove = useCallback(() => onImprove(), [onImprove])

  if (!hasSubtitles) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      {isImproving && <BlockingLoader message="Mejorando subtítulos con IA…" />}

      <h4 className="flex items-center gap-2 text-sm font-medium text-text-strong">
        Mejorar subtítulos
        <span className="rounded-full bg-accent-bg px-2 py-0.5 text-xs font-normal text-accent">Premium</span>
      </h4>

      {!hasAccess && <PremiumNotice />}

      <Button onClick={handleImprove} disabled={isImproving || !hasAccess} className="w-auto">
        {improveButtonLabel(state)}
      </Button>

      {state === 'error' && error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {SHORTS_ERROR_MESSAGES[error]}
        </div>
      )}
    </div>
  )
}
