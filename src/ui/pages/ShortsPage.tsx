import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Timeline } from '@domain/timeline'
import { timelineFingerprint } from '@domain/timeline'
import type { ProjectShorts, ShortIdeal } from '@domain/shorts'
import { shortKey } from '@domain/shorts'
import type { VideoAsset } from '@domain/video'
import { CreateShortsTool } from '@ui/components/CreateShortsTool'
import { useAuth } from '@ui/auth/useAuth'
import { useShorts } from '@ui/hooks/useShorts'
import { useSubtitles } from '@ui/hooks/useSubtitles'
import { shortsStorage, videoStorage, projectUseCase } from '@ui/video/composition'
import { timelineStorage } from '@ui/timeline/composition'

/**
 * Pantalla dedicada a shorts, separada del editor — el formulario de "short
 * ideal" y la lista de resultados necesitan más espacio del que un panel
 * lateral angosto puede darles, y es un flujo con su propio ciclo (llenar
 * form → detectar candidatos → calcular score) que no compite con la edición
 * del timeline por atención. Accesible desde el editor y desde el listado
 * de proyectos (este último, solo si el proyecto ya tiene shorts guardados).
 */
export function ShortsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { hasActiveFeature } = useAuth()
  const hasShortsAccess = hasActiveFeature('shorts_ai')

  const subtitlesState = useSubtitles(projectId ?? '')
  const shortsState = useShorts()

  // Timeline, assets y nombre del proyecto para reproducir/descargar el
  // recorte de cada short en ShortPreviewModal — se cargan una sola vez al
  // entrar, no se editan desde esta pantalla (solo lectura).
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [assetsById, setAssetsById] = useState<Record<string, VideoAsset>>({})
  const [projectName, setProjectName] = useState('')
  const [cropOffsetXByShort, setCropOffsetXByShort] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!projectId) return
    void timelineStorage.getByProject(projectId).then((result) => {
      if (result.ok) setTimeline(result.value)
    })
    void videoStorage.getByProject(projectId).then((assets) => {
      setAssetsById(Object.fromEntries(assets.map((asset) => [asset.id, asset])))
    })
    void projectUseCase.getAll().then((projects) => {
      setProjectName(projects.find((project) => project.id === projectId)?.name ?? projectId)
    })
  }, [projectId])

  // Se cargan los shorts ya guardados del proyecto (si los hay) al entrar a
  // la pantalla — createShorts los sobrescribe cuando el usuario genera de
  // nuevo, y el resultado nuevo se vuelve a persistir apenas llega.
  const loadedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!projectId || loadedRef.current === projectId) return
    loadedRef.current = projectId
    void Promise.all([shortsStorage.getByProject(projectId), timelineStorage.getByProject(projectId)]).then(
      ([shortsResult, timelineResult]) => {
        if (!shortsResult.ok || !shortsResult.value) return
        const currentFingerprint =
          timelineResult.ok && timelineResult.value ? timelineFingerprint(timelineResult.value) : null
        shortsState.loadPersisted(shortsResult.value, currentFingerprint)
        setCropOffsetXByShort(shortsResult.value.cropOffsetXByShort ?? {})
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleCreateShorts = useCallback(
    (shortIdeal?: ShortIdeal) => {
      if (!projectId || !subtitlesState.subtitles) return
      void shortsState.createShorts(projectId, subtitlesState.subtitles.segments, shortIdeal)
    },
    [projectId, subtitlesState.subtitles, shortsState],
  )

  // Persiste apenas el score termina, para que el listado de proyectos sepa
  // que este proyecto ya tiene shorts sin tener que volver a esta pantalla.
  const persistedRef = useRef<typeof shortsState.shorts | null>(null)
  useEffect(() => {
    if (!shortsState.justCreated) return
    if (shortsState.createShortsState !== 'success') return
    if (shortsState.shorts.length === 0) return
    if (persistedRef.current === shortsState.shorts) return
    persistedRef.current = shortsState.shorts
    if (!projectId) return
    void timelineStorage.getByProject(projectId).then((timelineResult) => {
      const record: ProjectShorts = {
        projectId,
        shorts: shortsState.shorts,
        warnings: shortsState.warnings,
        createdAt: new Date().toISOString(),
        timelineFingerprint:
          timelineResult.ok && timelineResult.value ? timelineFingerprint(timelineResult.value) : undefined,
      }
      void shortsStorage.save(record)
    })
  }, [shortsState.justCreated, shortsState.createShortsState, shortsState.shorts, shortsState.warnings, projectId])

  const handleUpdateCropOffset = useCallback(
    (short: { startMs: number; endMs: number }, cropOffsetX: number) => {
      if (!projectId) return
      const key = shortKey(short)
      const updated = { ...cropOffsetXByShort, [key]: cropOffsetX }
      setCropOffsetXByShort(updated)
      void shortsStorage.getByProject(projectId).then((result) => {
        if (!result.ok || !result.value) return
        void shortsStorage.save({ ...result.value, cropOffsetXByShort: updated })
      })
    },
    [projectId, cropOffsetXByShort],
  )

  if (!projectId) {
    return null
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Link
          to={`/projects/${projectId}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-strong hover:bg-surface-hover"
          aria-label="Volver al editor"
          title="Volver al editor"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold text-text-strong">Shorts</h1>
      </div>

      <CreateShortsTool
        hasAccess={hasShortsAccess}
        hasSubtitles={!!subtitlesState.subtitles && subtitlesState.subtitles.segments.length > 0}
        state={shortsState.createShortsState}
        error={shortsState.createShortsError}
        shorts={shortsState.shorts}
        warnings={shortsState.warnings}
        isStale={shortsState.isStale}
        onCreateShorts={handleCreateShorts}
        timeline={timeline}
        assets={assetsById}
        subtitleSegments={subtitlesState.subtitles?.segments ?? []}
        projectId={projectId}
        projectName={projectName}
        cropOffsetXByShort={cropOffsetXByShort}
        onUpdateCropOffset={handleUpdateCropOffset}
      />
    </div>
  )
}
