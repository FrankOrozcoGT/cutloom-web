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
  improvedSubtitles: { startMs: number; endMs: number; original: string; corrected: string }[]
  onImprove: (userContext?: string) => void
  onEdit: (index: number, corrected: string) => void
  onRemove: (index: number) => void
  onApproveAll: () => void
}

export function ImproveSubtitlesTool({
  hasAccess,
  hasSubtitles,
  state,
  error,
  improvedSubtitles,
  onImprove,
  onEdit,
  onRemove,
  onApproveAll,
}: ImproveSubtitlesToolProps) {
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

      {state === 'success' && improvedSubtitles.length > 0 && (
        <div className="flex flex-col gap-2">
          {improvedSubtitles.map((item, index) => (
            <div key={`${item.startMs}-${index}`} className="flex flex-col gap-1 rounded-md border border-border p-2 text-xs">
              <span className="text-text-muted line-through">{item.original}</span>
              <textarea
                value={item.corrected}
                onChange={(event) => onEdit(index, event.target.value)}
                className="rounded-md border border-border bg-transparent p-1 text-text-strong outline-none"
              />
              <button type="button" onClick={() => onRemove(index)} className="self-start text-danger hover:underline">
                Descartar
              </button>
            </div>
          ))}
          <Button variant="secondary" onClick={onApproveAll} className="w-auto">
            Aprobar todos
          </Button>
        </div>
      )}
    </div>
  )
}
