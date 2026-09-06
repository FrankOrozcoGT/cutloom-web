import { useCallback, useMemo, useState } from 'react'
import { Crop, Download, Play, Star, X } from 'lucide-react'
import type { Timeline } from '@domain/timeline'
import { estimateMaxCharsForCue, splitLongSubtitleCues, type SubtitleSegment } from '@domain/subtitles'
import type { ShortScore } from '@domain/shorts'
import type { VideoAsset } from '@domain/video'
import type { ExportOptions } from '@application/video/exportTypes'
import { Button } from '@ui/components/Button'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { TimelinePlayer } from '@ui/timeline/TimelinePlayer'
import { useExport } from '@ui/hooks/useExport'

// Formato estándar de shorts verticales (YouTube Shorts, TikTok, Reels):
// 1080x1920 9:16. El compositor de export rellena con blur el espacio que
// deja el video horizontal original en vez de recortarlo o deformarlo.
const SHORT_EXPORT_OPTIONS: ExportOptions = {
  format: 'video/mp4',
  fps: 30,
  width: 1080,
  height: 1920,
}

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
  timeline: Timeline
  assets: Record<string, VideoAsset>
  subtitleSegments: SubtitleSegment[]
  projectId: string
  projectName: string
  /** 0-1: qué franja horizontal del video queda visible tras el crop-to-fill (0.5 = centrado). Ajustable manualmente porque el centro no siempre tiene el contenido relevante (ej. screen recording con webcam en una esquina). */
  cropOffsetX: number
  onUpdateCropOffset: (cropOffsetX: number) => void
}

/**
 * Barra de ajuste superpuesta sobre el propio video (no en el bloque de
 * texto de abajo, ni en un modal) — vive pegada al botón que la abre
 * (mismo marco visual, arriba a la derecha) y el video sigue completamente
 * visible detrás mientras se mueve el slider, que es el único motivo de no
 * usar un modal acá: hace falta ver el resultado en vivo para decidir.
 */
function CropOffsetControl({ cropOffsetX, onChange }: { cropOffsetX: number; onChange: (value: number) => void }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6"
      onClick={(event) => event.stopPropagation()}
    >
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
    </div>
  )
}

/**
 * Card expandida en el listado (no modal): reproduce el recorte del short
 * inline usando TimelinePlayer (mismo motor multi-clip que el editor,
 * necesario porque un short puede cruzar más de un clip del timeline),
 * muestra su descripción, score en estrellas y los subtítulos del tramo
 * (útiles para análisis posterior sin tener que volver a reproducir), y
 * permite descargar el recorte ya renderizado en vertical.
 */
export function ShortCard({
  short,
  timeline,
  assets,
  subtitleSegments,
  projectId,
  projectName,
  cropOffsetX,
  onUpdateCropOffset,
}: ShortCardProps) {
  const [playheadMs, setPlayheadMs] = useState(short.startMs)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const { exporting, progress, phaseLabel, error, exportProject } = useExport()

  // Mismo cálculo que ExportProjectUseCase (estimateMaxCharsForCue) sobre las
  // mismas dimensiones de SHORT_EXPORT_OPTIONS — es una razón de aspecto, no
  // un tamaño absoluto, así que da igual que el DOM real sea más chico.
  const shortSubtitles = useMemo(
    () =>
      splitLongSubtitleCues(
        subtitleSegments.filter((segment) => segment.startMs < short.endMs && segment.endMs > short.startMs),
        estimateMaxCharsForCue(SHORT_EXPORT_OPTIONS.width, SHORT_EXPORT_OPTIONS.height),
      ),
    [subtitleSegments, short.startMs, short.endMs],
  )

  const handlePlayheadChange = useCallback(
    (ms: number) => {
      if (ms >= short.endMs) {
        setPlayheadMs(short.startMs)
        setIsPlaying(false)
        return
      }
      setPlayheadMs(ms)
    },
    [short.startMs, short.endMs],
  )

  const handleDownload = useCallback(() => {
    exportProject(
      projectId,
      `${projectName}-short-${Math.round(short.startMs / 1000)}s`,
      SHORT_EXPORT_OPTIONS,
      { startMs: short.startMs, endMs: short.endMs },
      cropOffsetX,
    )
  }, [exportProject, projectId, projectName, short.startMs, short.endMs, cropOffsetX])

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      {/*
        Crop-to-fill (object-cover), igual que el export final —
        OffscreenCanvasCompositor.drawFrameFitted: el video llena el marco
        9:16 completo, recortando los bordes sobrantes. Es el estándar para
        contenido de pantalla completa/cámara amplia en shorts (más legible
        que mostrar todo el frame achicado con relleno arriba/abajo).
      */}
      <div
        className="relative aspect-[9/16] w-full cursor-pointer overflow-hidden bg-black"
        onClick={() => setIsPlaying((prev) => !prev)}
      >
        <TimelinePlayer
          timeline={timeline}
          assets={assets}
          playheadMs={playheadMs}
          isPlaying={isPlaying}
          onPlayheadChange={handlePlayheadChange}
          onPlayingChange={setIsPlaying}
          segments={shortSubtitles}
          containerClassName="absolute inset-0 h-full w-full overflow-hidden"
          videoObjectFit="cover"
          objectPositionX={cropOffsetX * 100}
        />

        <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1">
          <ScoreStars score={short.score} />
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
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

        {isCropModalOpen && <CropOffsetControl cropOffsetX={cropOffsetX} onChange={onUpdateCropOffset} />}
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
            {exporting ? `${phaseLabel} ${progress}%` : 'Descargar'}
          </span>
        </Button>

        {error && <ErrorBanner>{error}</ErrorBanner>}
      </div>
    </div>
  )
}
