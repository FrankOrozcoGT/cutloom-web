import { useState } from 'react'
import type { Timeline } from '@domain/timeline'
import type { SubtitleSegment } from '@domain/subtitles'
import { shortKey, type ShortIdeal, type ShortScore } from '@domain/shorts'
import type { VideoAsset } from '@domain/video'
import type { ShortsErrorCode } from '@application/shorts/errors'
import type { CreateShortsState } from '@ui/hooks/useShorts'
import { Button } from '@ui/components/Button'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { PremiumNotice } from '@ui/billing/PremiumNotice'
import { ShortIdealModal } from '@ui/components/ShortIdealModal'
import { ShortCard } from '@ui/components/ShortCard'
import { describeShortsWarning, SHORTS_ERROR_MESSAGES } from '@ui/shorts/errorMessages'

interface CreateShortsToolProps {
  hasAccess: boolean
  hasSubtitles: boolean
  state: CreateShortsState
  error: ShortsErrorCode | null
  shorts: ShortScore[]
  warnings: string[]
  isStale: boolean
  onCreateShorts: (shortIdeal?: ShortIdeal) => void
  timeline: Timeline | null
  assets: Record<string, VideoAsset>
  subtitleSegments: SubtitleSegment[]
  projectId: string
  projectName: string
  cropOffsetXByShort: Record<string, number>
  onUpdateCropOffset: (short: { startMs: number; endMs: number }, cropOffsetX: number) => void
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
  timeline,
  assets,
  subtitleSegments,
  projectId,
  projectName,
  cropOffsetXByShort,
  onUpdateCropOffset,
}: CreateShortsToolProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const isCreating = state === 'detecting' || state === 'extracting_audio' || state === 'scoring'

  if (!hasSubtitles) {
    return <p className="text-sm text-text-muted">Genera subtítulos primero para crear shorts.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {!hasAccess && <PremiumNotice />}

      <Button onClick={() => setIsFormOpen(true)} disabled={isCreating || !hasAccess} className="w-auto">
        {isCreating ? 'Creando shorts…' : shorts.length > 0 ? 'Recrear shorts' : 'Crear shorts'}
      </Button>

      {isFormOpen && (
        <ShortIdealModal state={state} onCreateShorts={onCreateShorts} onClose={() => setIsFormOpen(false)} />
      )}

      {state === 'error' && error && <ErrorBanner>{SHORTS_ERROR_MESSAGES[error]}</ErrorBanner>}

      {warnings.length > 0 && (
        <ErrorBanner variant="warning">{warnings.map(describeShortsWarning).join(' · ')}</ErrorBanner>
      )}

      {isStale && shorts.length > 0 && (
        <ErrorBanner variant="warning">
          Estos shorts se generaron con una versión anterior del timeline — los tiempos pueden ya no corresponder al contenido actual. Genera de nuevo para actualizarlos.
        </ErrorBanner>
      )}

      {shorts.length > 0 && timeline && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shorts.map((short) => (
            <ShortCard
              key={shortKey(short)}
              short={short}
              timeline={timeline}
              assets={assets}
              subtitleSegments={subtitleSegments}
              projectId={projectId}
              projectName={projectName}
              cropOffsetX={cropOffsetXByShort[shortKey(short)] ?? 0.5}
              onUpdateCropOffset={(cropOffsetX) => onUpdateCropOffset(short, cropOffsetX)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
