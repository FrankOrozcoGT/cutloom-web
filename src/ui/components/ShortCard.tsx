import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crop, Download, Loader2, Play, Sparkles, Star, X } from 'lucide-react'
import type { Render } from '@domain/render'
import { splitLongSubtitleCues, SUBTITLE_STYLE, estimateMaxCharsForCue, type SubtitleSegment } from '@domain/subtitles'
import type { AutoFrameKeyframe, ShortScore } from '@domain/shorts'
import { SHORT_HEIGHT, SHORT_WIDTH, interpolateCropOffsetX } from '@domain/shorts'
import { Button } from '@ui/components/Button'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { useRenderFrame } from '@ui/timeline/useRenderFrame'
import { useObjectUrl } from '@ui/hooks/useObjectUrl'
import { useExport } from '@ui/hooks/useExport'

const STAR_COUNT = 5
// Los scores reales del backend caen casi siempre en 0.4-1.0 — mapear ese
// rango completo a 5 estrellas (en vez de 0-1 directo) hace que la diferencia
// entre candidatos buenos (0.68 vs 0.72) se note en vez de que ambos
// redondeen a las mismas estrellas. Por debajo del umbral, un indicador rojo
// distinto en vez de estrellas vacías que no comunican nada.
const LOW_SCORE_THRESHOLD = 0.4

function ScoreStars({ score }: { score: number }) {
  if (score < LOW_SCORE_THRESHOLD) {
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-danger" title={`Score ${score.toFixed(2)}`}>
        <span aria-hidden>−</span> Bajo
      </span>
    )
  }
  const normalizedScore = (score - LOW_SCORE_THRESHOLD) / (1 - LOW_SCORE_THRESHOLD)
  const filledStars = Math.max(1, Math.round(normalizedScore * STAR_COUNT))
  return (
    <span className="flex items-center gap-0.5" title={`Score ${score.toFixed(2)}`}>
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < filledStars ? 'fill-accent text-accent' : 'text-text-muted'}`} />
      ))}
    </span>
  )
}

interface ShortCardProps {
  short: ShortScore
  /** Render ya consolidado del proyecto (ver domain/render.ts) — el short siempre se recorta y reproduce de este único archivo, nunca del timeline multi-clip en vivo. */
  render: Render
  subtitleSegments: SubtitleSegment[]
  projectId: string
  projectName: string
  /** 0-1: qué franja horizontal del video queda visible tras el crop-to-fill (0.5 = centrado). Ajustable manualmente porque el centro no siempre tiene el contenido relevante (ej. screen recording con webcam en una esquina). Ignorado mientras autoFrameEnabled sea true. */
  cropOffsetX: number
  onUpdateCropOffset: (cropOffsetX: number) => void
  /** true si este short usa la trayectoria de auto-encuadre (autoFrameKeyframes) en vez del offset fijo. */
  autoFrameEnabled: boolean
  onToggleAutoFrame: (enabled: boolean) => void
  /** Trayectoria ya calculada (ver MotionFramingAnalyzerPort) — null si todavía no se analizó este short. */
  autoFrameKeyframes: AutoFrameKeyframe[] | null
  isAnalyzingAutoFrame: boolean
  /** Recibe el short entero (no un closure ya armado por el caller) para que ShortCard pueda memoizar un callback de identidad estable con useCallback — necesario porque el useEffect que dispara el análisis automático debe poder declararlo en sus deps sin re-ejecutarse en cada render del padre. */
  onAnalyzeAutoFrame: (short: Pick<ShortScore, 'startMs' | 'endMs'>) => Promise<void>
}

/**
 * Barra de ajuste superpuesta sobre el propio video (no en el bloque de
 * texto de abajo, ni en un modal) — vive pegada al botón que la abre
 * (mismo marco visual, arriba a la derecha) y el video sigue completamente
 * visible detrás mientras se mueve el slider, que es el único motivo de no
 * usar un modal acá: hace falta ver el resultado en vivo para decidir.
 */
function CropOffsetControl({
  cropOffsetX,
  onChange,
  autoFrameEnabled,
  onToggleAutoFrame,
  hasAutoFrameData,
  isAnalyzingAutoFrame,
  onAnalyzeAutoFrame,
}: {
  cropOffsetX: number
  onChange: (value: number) => void
  autoFrameEnabled: boolean
  onToggleAutoFrame: (enabled: boolean) => void
  hasAutoFrameData: boolean
  isAnalyzingAutoFrame: boolean
  onAnalyzeAutoFrame: () => void
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6"
      onClick={(event) => event.stopPropagation()}
    >
      <label className="flex items-center justify-between gap-2 text-xs text-white">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Auto-encuadre
        </span>
        <input
          type="checkbox"
          checked={autoFrameEnabled}
          onChange={(event) => onToggleAutoFrame(event.target.checked)}
        />
      </label>

      {autoFrameEnabled && (
        <button
          type="button"
          onClick={onAnalyzeAutoFrame}
          disabled={isAnalyzingAutoFrame}
          className="flex items-center justify-center gap-1.5 rounded bg-white/15 px-2 py-1 text-[11px] text-white hover:bg-white/25 disabled:opacity-60"
        >
          {isAnalyzingAutoFrame ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Analizando movimiento…
            </>
          ) : hasAutoFrameData ? (
            'Recalcular encuadre automático'
          ) : (
            'Calcular encuadre automático'
          )}
        </button>
      )}

      {!autoFrameEnabled && (
        <>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={cropOffsetX}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-white/80">
            <span>Izquierda</span>
            <span>Centro</span>
            <span>Derecha</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Card expandida en el listado (no modal): reproduce el recorte del short
 * inline con un <video> nativo del DOM acotado a [short.startMs,
 * short.endMs) sobre el Render ya consolidado — un único archivo MP4 con
 * índice de seek real, así que no hace falta el motor multi-clip
 * (WebCodecs/canvas) que usa el editor. Permite descargar el recorte ya
 * renderizado en vertical (extraído del mismo Render).
 */
export function ShortCard({
  short,
  render,
  subtitleSegments,
  projectId,
  projectName,
  cropOffsetX,
  onUpdateCropOffset,
  autoFrameEnabled,
  onToggleAutoFrame,
  autoFrameKeyframes,
  isAnalyzingAutoFrame,
  onAnalyzeAutoFrame,
}: ShortCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeSegment, setActiveSegment] = useState<SubtitleSegment | null>(null)
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  // Offset horizontal efectivo del frame actual mientras reproduce en modo
  // auto-encuadre — se recalcula en cada timeupdate interpolando
  // autoFrameKeyframes (ver domain/shorts.interpolateCropOffsetX), nunca un
  // valor fijo como en modo manual.
  const [liveAutoCropOffsetX, setLiveAutoCropOffsetX] = useState(0.5)
  const videoRef = useRef<HTMLVideoElement>(null)
  const { exporting, progress, error, exportProject } = useExport()

  const effectiveCropOffsetX =
    autoFrameEnabled && autoFrameKeyframes
      ? isPlaying
        ? liveAutoCropOffsetX
        : interpolateCropOffsetX(autoFrameKeyframes, 0)
      : cropOffsetX

  // Callback de identidad estable (solo cambia si short.startMs/endMs
  // cambian) — permite declararlo en deps del useEffect de abajo sin que
  // CreateShortsTool tenga que memoizar el wrapper que arma por short
  // dentro de su .map (no puede: depende de la iteración).
  const analyzeThisShort = useCallback(() => onAnalyzeAutoFrame(short), [onAnalyzeAutoFrame, short])

  // Dispara el análisis solo: cuando el auto-encuadre queda activado sin
  // trayectoria calculada todavía — pasa al activarlo a mano (igual que
  // antes) y también cuando el valor por default ya viene en true (hay
  // región de avatar marcada a nivel proyecto, ver CreateShortsTool) sin que
  // el usuario haya tocado el checkbox de este short en particular.
  useEffect(() => {
    if (autoFrameEnabled && !autoFrameKeyframes && !isAnalyzingAutoFrame) {
      void analyzeThisShort()
    }
  }, [autoFrameEnabled, autoFrameKeyframes, isAnalyzingAutoFrame, analyzeThisShort])

  const renderUrl = useObjectUrl(render.blob)
  // Preview en reposo: un frame estático capturado una sola vez, en vez de
  // montar el <video> hasta que el usuario pide reproducir — con varias
  // ShortCard a la vez en pantalla, decodificar en cada una solo para
  // mostrar una imagen fija es trabajo innecesario.
  const previewFrameUrl = useRenderFrame(isPlaying ? null : render, short.startMs)

  const shortSubtitles = useMemo(
    () =>
      splitLongSubtitleCues(
        subtitleSegments.filter((segment) => segment.startMs < short.endMs && segment.endMs > short.startMs),
        estimateMaxCharsForCue(SHORT_WIDTH, SHORT_HEIGHT),
      ),
    [subtitleSegments, short.startMs, short.endMs],
  )

  // Arranca siempre en short.startMs al empezar a reproducir, y se pausa
  // sola al llegar a short.endMs — un <video> nativo normal, sin reloj
  // propio ni decode manual: el Render ya tiene índice de seek real.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!isPlaying) {
      video.pause()
      setActiveSegment(null)
      return
    }

    video.currentTime = short.startMs / 1000
    void video.play().catch(() => {})

    function handleTimeUpdate() {
      if (video!.currentTime * 1000 >= short.endMs) {
        video!.pause()
        setIsPlaying(false)
      }
      const segment = shortSubtitles.find((s) => video!.currentTime * 1000 >= s.startMs && video!.currentTime * 1000 < s.endMs)
      setActiveSegment(segment ?? null)
      if (autoFrameEnabled && autoFrameKeyframes) {
        const atMs = video!.currentTime * 1000 - short.startMs
        setLiveAutoCropOffsetX(interpolateCropOffsetX(autoFrameKeyframes, atMs))
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
  }, [isPlaying, short.startMs, short.endMs, shortSubtitles, autoFrameEnabled, autoFrameKeyframes])

  const handleDownload = useCallback(() => {
    exportProject(
      projectId,
      `${projectName}-short-${Math.round(short.startMs / 1000)}s`,
      { startMs: short.startMs, endMs: short.endMs },
      autoFrameEnabled && autoFrameKeyframes
        ? { mode: 'auto', keyframes: autoFrameKeyframes }
        : { mode: 'fixed', cropOffsetX },
    )
  }, [exportProject, projectId, projectName, short.startMs, short.endMs, cropOffsetX, autoFrameEnabled, autoFrameKeyframes])

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      {/*
        Crop-to-fill (object-cover), igual que el export final: el video
        llena el marco 9:16 completo, recortando los bordes sobrantes.
      */}
      <div
        className="relative aspect-[9/16] w-full cursor-pointer overflow-hidden bg-black"
        onClick={() => setIsPlaying((prev) => !prev)}
        style={{ containerType: 'size' }}
      >
        <video
          ref={videoRef}
          src={renderUrl || undefined}
          muted={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ visibility: isPlaying ? 'visible' : 'hidden', objectPosition: `${effectiveCropOffsetX * 100}% center` }}
        />
        {!isPlaying && previewFrameUrl && (
          <img
            src={previewFrameUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${effectiveCropOffsetX * 100}% center` }}
          />
        )}

        <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1">
          <ScoreStars score={short.score} />
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setIsPlaying(false)
            setIsCropModalOpen((prev) => !prev)
          }}
          title={isCropModalOpen ? 'Cerrar ajuste de encuadre' : 'Ajustar encuadre'}
          aria-label={isCropModalOpen ? 'Cerrar ajuste de encuadre' : 'Ajustar encuadre'}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded bg-black/70 text-white hover:bg-black/85"
        >
          {isCropModalOpen ? <X className="h-3.5 w-3.5" /> : <Crop className="h-3.5 w-3.5" />}
        </button>

        {!isPlaying && !isCropModalOpen && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60">
              <Play className="h-7 w-7 fill-white text-white" />
            </div>
          </div>
        )}

        {isPlaying && activeSegment && (
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center"
            style={{ bottom: `${SUBTITLE_STYLE.bottomMarginRatio * 100}cqh` }}
          >
            <span
              className="line-clamp-2 rounded text-center font-bold text-white"
              style={{
                maxWidth: `${SUBTITLE_STYLE.maxWidthRatio * 100}cqw`,
                fontSize: `${SUBTITLE_STYLE.fontSizeRatio * 100}cqh`,
                lineHeight: SUBTITLE_STYLE.lineHeightRatio,
                WebkitTextStroke: '0.06em black',
                paintOrder: 'stroke fill',
              }}
            >
              {activeSegment.text}
            </span>
          </div>
        )}

        {isCropModalOpen && (
          <CropOffsetControl
            cropOffsetX={cropOffsetX}
            onChange={onUpdateCropOffset}
            autoFrameEnabled={autoFrameEnabled}
            onToggleAutoFrame={onToggleAutoFrame}
            hasAutoFrameData={!!autoFrameKeyframes}
            isAnalyzingAutoFrame={isAnalyzingAutoFrame}
            onAnalyzeAutoFrame={analyzeThisShort}
          />
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <span className="text-xs text-text-muted">
          {(short.startMs / 1000).toFixed(1)}s – {(short.endMs / 1000).toFixed(1)}s
          {short.emotion && ` · ${short.emotion}`}
        </span>

        <p className="text-sm text-text-strong">{short.reason}</p>

        {shortSubtitles.length > 0 && (
          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer select-none">Subtítulos del tramo ({shortSubtitles.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {shortSubtitles.map((segment) => (
                <li key={segment.id}>
                  <span className="text-text-muted">{(segment.startMs / 1000).toFixed(1)}s —</span> {segment.text}
                </li>
              ))}
            </ul>
          </details>
        )}

        <Button onClick={handleDownload} disabled={exporting} className="w-auto">
          <span className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            {exporting ? `Exportando… ${progress}%` : 'Descargar'}
          </span>
        </Button>

        {error && <ErrorBanner>{error}</ErrorBanner>}
      </div>
    </div>
  )
}
