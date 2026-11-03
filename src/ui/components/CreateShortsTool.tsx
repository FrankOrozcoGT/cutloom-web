import { useState } from 'react'
import type { Render } from '@domain/render'
import type { SubtitleSegment } from '@domain/subtitles'
import {
  resolveShortFraming,
  shortKey,
  type AutoFrameKeyframe,
  type NormalizedRect,
  type ShortFramingState,
  type ShortIdeal,
  type ShortScore,
} from '@domain/shorts'
import type { ShortsErrorCode } from '@application/shorts/errors'
import type { CreateShortsState } from '@ui/hooks/useShorts'
import type { AnalyzeAutoFrameState } from '@ui/hooks/useAutoFraming'
import { Button } from '@ui/components/Button'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { PremiumNotice } from '@ui/billing/PremiumNotice'
import { ShortIdealModal } from '@ui/components/ShortIdealModal'
import { ShortCard } from '@ui/components/ShortCard'
import { MotionExcludeRectSelector } from '@ui/components/MotionExcludeRectSelector'
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
  render: Render | null
  subtitleSegments: SubtitleSegment[]
  projectId: string
  projectName: string
  cropOffsetXByShort: Record<string, number>
  onUpdateCropOffset: (short: { startMs: number; endMs: number }, cropOffsetX: number) => void
  autoFrameEnabledByShort: Record<string, boolean>
  autoFramingByShort: Record<string, AutoFrameKeyframe[]>
  analyzingShortKey: string | null
  analyzeState: AnalyzeAutoFrameState
  onToggleAutoFrame: (short: { startMs: number; endMs: number }, enabled: boolean) => void
  onAnalyzeAutoFrame: (short: { startMs: number; endMs: number }) => Promise<void>
  /** Región del avatar/webcam a ignorar en el análisis de movimiento — una sola por proyecto, marcada a mano sobre un frame del render (ver MotionExcludeRectSelector). null = no hay región marcada. */
  motionExcludeRect: NormalizedRect | null
  onChangeMotionExcludeRect: (rect: NormalizedRect | null) => void
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
  render,
  subtitleSegments,
  projectId,
  projectName,
  cropOffsetXByShort,
  onUpdateCropOffset,
  autoFrameEnabledByShort,
  autoFramingByShort,
  analyzingShortKey,
  analyzeState,
  onToggleAutoFrame,
  onAnalyzeAutoFrame,
  motionExcludeRect,
  onChangeMotionExcludeRect,
}: CreateShortsToolProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isExcludeRectSelectorOpen, setIsExcludeRectSelectorOpen] = useState(false)
  const [isReframingAll, setIsReframingAll] = useState(false)
  const isCreating = state === 'detecting' || state === 'extracting_audio' || state === 'scoring'

  // Estado de encuadre del proyecto en la forma que necesita
  // resolveShortFraming — única fuente de verdad del encuadre efectivo (ver
  // domain/shorts.ts), compartida con usePublish para que un short
  // publicado nunca quede con un encuadre distinto al que esta pantalla
  // muestra/descarga.
  const framingState: ShortFramingState = {
    cropOffsetXByShort,
    autoFrameEnabledByShort,
    autoFramingByShort,
    motionExcludeRect: motionExcludeRect ?? undefined,
  }

  const isAutoFrameEffectivelyEnabled = (key: string): boolean => resolveShortFraming(framingState, key).mode === 'auto'

  // Secuencial (un short a la vez, no Promise.all) a propósito: cada análisis
  // decodifica el tramo completo del render — correrlos todos en paralelo
  // saturaría CPU/memoria sin necesidad, el usuario puede esperar un poco más.
  const handleReframeAll = async () => {
    setIsReframingAll(true)
    for (const short of shorts) {
      if (isAutoFrameEffectivelyEnabled(shortKey(short))) {
        await onAnalyzeAutoFrame(short)
      }
    }
    setIsReframingAll(false)
  }

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
          Estos shorts se generaron contra una versión anterior del video — los tiempos pueden ya no corresponder al contenido actual. Genera de nuevo para actualizarlos.
        </ErrorBanner>
      )}

      {shorts.length > 0 && render && (
        <div className="flex items-center gap-2 text-sm text-text-strong">
          <button
            type="button"
            onClick={() => setIsExcludeRectSelectorOpen(true)}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-hover"
          >
            {motionExcludeRect ? 'Editar región del avatar' : 'Marcar región del avatar a ignorar'}
          </button>
          <button
            type="button"
            onClick={() => void handleReframeAll()}
            disabled={isReframingAll || analyzeState === 'analyzing'}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-60"
          >
            {isReframingAll ? 'Reencuadrando…' : 'Reencuadrar todos'}
          </button>
          {motionExcludeRect && (
            <button
              type="button"
              onClick={() => onChangeMotionExcludeRect(null)}
              className="text-xs text-text-muted underline hover:text-text-strong"
            >
              Quitar
            </button>
          )}
        </div>
      )}

      {isExcludeRectSelectorOpen && render && (
        <MotionExcludeRectSelector
          render={render}
          rect={motionExcludeRect}
          onChange={onChangeMotionExcludeRect}
          onClose={() => setIsExcludeRectSelectorOpen(false)}
        />
      )}

      {shorts.length > 0 && render && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shorts.map((short) => {
            const key = shortKey(short)
            return (
              <ShortCard
                key={key}
                short={short}
                render={render}
                subtitleSegments={subtitleSegments}
                projectId={projectId}
                projectName={projectName}
                cropOffsetX={cropOffsetXByShort[key] ?? 0.5}
                onUpdateCropOffset={(cropOffsetX) => onUpdateCropOffset(short, cropOffsetX)}
                autoFrameEnabled={isAutoFrameEffectivelyEnabled(key)}
                onToggleAutoFrame={(enabled) => onToggleAutoFrame(short, enabled)}
                autoFrameKeyframes={autoFramingByShort[key] ?? null}
                isAnalyzingAutoFrame={analyzingShortKey === key && analyzeState === 'analyzing'}
                onAnalyzeAutoFrame={onAnalyzeAutoFrame}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
