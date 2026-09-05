import { useCallback, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { ProjectShorts, ShortIdeal } from '@domain/shorts'
import { timelineFingerprint } from '@domain/timeline'
import { CreateShortsTool } from '@ui/components/CreateShortsTool'
import { useAuth } from '@ui/auth/useAuth'
import { useShorts } from '@ui/hooks/useShorts'
import { useSubtitles } from '@ui/hooks/useSubtitles'
import { shortsStorage } from '@ui/video/composition'
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
      />
    </div>
  )
}
