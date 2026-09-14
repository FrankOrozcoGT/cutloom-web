import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { shortKey } from '@domain/shorts'
import type { MetadataContext } from '@domain/publishing'
import { useAuth } from '@ui/auth/useAuth'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { Button } from '@ui/components/Button'
import { PremiumNotice } from '@ui/billing/PremiumNotice'
import { PublishItemCard } from '@ui/components/PublishItemCard'
import { PublishSchedule } from '@ui/components/PublishSchedule'
import { GenerateMetadataModal } from '@ui/components/GenerateMetadataModal'
import { usePublishYouTube, type PublishSeriesItem } from '@ui/hooks/usePublishYouTube'
import { shortsStorage, projectUseCase } from '@ui/video/composition'
import { timelineStorage } from '@ui/timeline/composition'
import { subtitlesStorage } from '@ui/subtitles/composition'
import { startYouTubeOAuth } from '@ui/publishing/oauth'
import { publishingStorage } from '@ui/publishing/composition'
import type { Timeline } from '@domain/timeline'
import type { ShortScore } from '@domain/shorts'
import type { Subtitles } from '@domain/subtitles'

const MAX_ITEMS_PER_BULK = 10

/** sourceId derivado del short: estable mientras no se regeneren los shorts del proyecto (mismo criterio que shortKey). */
function shortSourceId(projectId: string, short: Pick<ShortScore, 'startMs' | 'endMs'>): string {
  return `${projectId}::short::${shortKey(short)}`
}

/**
 * context.subtitles va en segundos (wire format del backend) — el dominio
 * local los tiene en ms. range acota a un tramo del video (usado por los
 * shorts). summary es Project.description, el mismo resumen que ya persiste
 * EditorPage tras mejorar subtítulos con IA — se reenvía tal cual, sin
 * volver a generarlo, tanto para el video largo como para cada short.
 */
function toMetadataContext(
  subtitles: Subtitles | null,
  summary: string | undefined,
  range?: { startMs: number; endMs: number },
): MetadataContext | undefined {
  const inRange = subtitles
    ? range
      ? subtitles.segments.filter((segment) => segment.startMs >= range.startMs && segment.endMs <= range.endMs)
      : subtitles.segments
    : []

  if (inRange.length === 0 && !summary) return undefined

  return {
    summary,
    subtitles: inRange.length > 0
      ? inRange.map((segment) => ({ start: segment.startMs / 1000, end: segment.endMs / 1000, text: segment.text }))
      : undefined,
  }
}

export function PublishingPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { hasActiveFeature, youtubeConnected } = useAuth()
  const hasAiAccess = hasActiveFeature('youtube_ai')

  const [projectName, setProjectName] = useState('')
  const [hasTimeline, setHasTimeline] = useState(false)
  const [shorts, setShorts] = useState<ShortScore[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false)

  const publishState = usePublishYouTube({ projectId: projectId ?? '', projectName })

  useEffect(() => {
    if (!projectId) return
    void projectUseCase.getAll().then((projects) => {
      const project = projects.find((p) => p.id === projectId)
      setProjectName(project?.name ?? projectId)

      void Promise.all([timelineStorage.getByProject(projectId), subtitlesStorage.getByProject(projectId)]).then(
        ([timelineResult, subtitlesResult]) => {
          const timeline: Timeline | null = timelineResult.ok ? timelineResult.value : null
          const subtitles: Subtitles | null = subtitlesResult.ok ? subtitlesResult.value : null
          const durationOk = !!timeline && timeline.tracks.some((track) => track.clips.length > 0)
          setHasTimeline(durationOk)

          const longItem: PublishSeriesItem = {
            sourceId: projectId,
            videoType: 'long',
            context: toMetadataContext(subtitles, project?.description),
            state: 'idle',
            revision: null,
            error: null,
            result: null,
          }

          void Promise.all([shortsStorage.getByProject(projectId), publishingStorage.getByProject(projectId)]).then(
            ([shortsResult, publishingResult]) => {
              const projectShorts = shortsResult.ok ? shortsResult.value : null
              const persisted = publishingResult.ok ? publishingResult.value?.bySourceId : undefined
              const shortItems: PublishSeriesItem[] = (projectShorts?.shorts ?? []).map((short) => ({
                sourceId: shortSourceId(projectId, short),
                videoType: 'short',
                score: short.score,
                range: { startMs: short.startMs, endMs: short.endMs },
                cropOffsetX: projectShorts?.cropOffsetXByShort?.[shortKey(short)],
                context: {
                  ...toMetadataContext(subtitles, project?.description, { startMs: short.startMs, endMs: short.endMs }),
                  detectedReason: short.reason,
                  score: short.score,
                },
                state: 'idle' as const,
                revision: null,
                error: null,
                result: null,
              }))
              setShorts(projectShorts?.shorts ?? [])
              const seriesItems = durationOk ? [longItem, ...shortItems] : shortItems
              publishState.initItems(seriesItems, persisted)
              // Por default se publica toda la serie — el usuario destilda lo que no quiera enviar.
              setSelected(new Set(seriesItems.slice(0, MAX_ITEMS_PER_BULK).map((item) => item.sourceId)))
            },
          )
        },
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (!projectId) return null

  const allItems = Object.values(publishState.items)
  const overLimit = selected.size > MAX_ITEMS_PER_BULK
  const wizardRunning = publishState.metadataProgress !== null
  // Cualquier item seleccionado que todavía esté generando/regenerando metadata (individualmente, vía "Regenerar con feedback") bloquea publicar, no solo el wizard general.
  const anySelectedGenerating = [...selected].some((sourceId) => publishState.items[sourceId]?.state === 'generating')
  // No se puede publicar si algún seleccionado no tiene metadata generada todavía — bloquea el botón, no solo el intento de submit.
  const anySelectedWithoutMetadata = [...selected].some((sourceId) => !publishState.items[sourceId]?.revision)
  const anySelectedAlreadyPublished = [...selected].some((sourceId) =>
    ['uploaded', 'scheduled'].includes(publishState.items[sourceId]?.state ?? ''),
  )

  function toggleSelected(sourceId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Link
          to={`/projects/${projectId}/shorts`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-strong hover:bg-surface-hover"
          aria-label="Volver a shorts"
          title="Volver a shorts"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold text-text-strong">Publicar en YouTube</h1>
      </div>

      {!hasTimeline && shorts.length === 0 && (
        <ErrorBanner variant="warning">Este proyecto no tiene timeline ni shorts para publicar.</ErrorBanner>
      )}

      {!youtubeConnected && (
        <ErrorBanner variant="warning">
          Todavía no conectaste tu cuenta de YouTube.{' '}
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={() => void startYouTubeOAuth(`/projects/${projectId}/publish`)}
          >
            Conectar YouTube
          </button>
        </ErrorBanner>
      )}

      {overLimit && <ErrorBanner>Máximo {MAX_ITEMS_PER_BULK} videos por envío.</ErrorBanner>}

      {publishState.publishError && <ErrorBanner>{publishState.publishError}</ErrorBanner>}

      <PublishSchedule
        longVideoPublishDay={publishState.longVideoPublishDay}
        onChange={publishState.setLongVideoPublishDay}
        isScheduled={allItems.some((item) => item.state === 'scheduled')}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-text-strong">1. Generar metadatos con IA</h2>

        {!hasAiAccess && <PremiumNotice />}

        <Button
          type="button"
          disabled={!hasAiAccess || wizardRunning || selected.size === 0}
          onClick={() => setIsMetadataModalOpen(true)}
        >
          {wizardRunning
            ? `Generando metadatos… (${publishState.metadataProgress?.done}/${publishState.metadataProgress?.total})`
            : 'Generar metadatos'}
        </Button>
      </div>

      {isMetadataModalOpen && (
        <GenerateMetadataModal
          onGenerate={(input) => void publishState.generateAllMetadata([...selected], input)}
          onClose={() => setIsMetadataModalOpen(false)}
        />
      )}

      <h2 className="text-sm font-semibold text-text-strong">2. Revisar y publicar</h2>

      <div className="flex flex-col gap-4">
        {allItems.map((item) => (
          <div key={item.sourceId} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-5"
              checked={selected.has(item.sourceId)}
              disabled={wizardRunning}
              onChange={() => toggleSelected(item.sourceId)}
            />
            <div className="flex-1">
              <PublishItemCard
                item={item}
                title={item.videoType === 'long' ? projectName : `Short ${shortKey(item.range)}`}
                onRegenerate={(feedback) => void publishState.regenerateMetadata(item.sourceId, feedback)}
              />
            </div>
          </div>
        ))}
      </div>

      {anySelectedWithoutMetadata && (
        <ErrorBanner variant="warning">
          Generá los metadatos de todos los videos seleccionados antes de publicar.
        </ErrorBanner>
      )}

      <Button
        type="button"
        disabled={
          selected.size === 0 ||
          overLimit ||
          wizardRunning ||
          anySelectedGenerating ||
          anySelectedWithoutMetadata ||
          publishState.isPublishing ||
          !youtubeConnected
        }
        onClick={() => {
          if (anySelectedAlreadyPublished && !window.confirm('Algunos videos seleccionados ya fueron publicados. ¿Querés volver a publicarlos?')) {
            return
          }
          void publishState.publish([...selected])
        }}
      >
        {publishState.isPublishing ? 'Publicando…' : `Publicar seleccionados (${selected.size})`}
      </Button>
    </div>
  )
}
