import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Render } from '@domain/render'
import type { AutoFrameKeyframe, NormalizedRect, ShortIdeal } from '@domain/shorts'
import { shortKey } from '@domain/shorts'
import { CreateShortsTool } from '@ui/components/CreateShortsTool'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { useAuth } from '@ui/auth/useAuth'
import { useShorts } from '@ui/hooks/useShorts'
import { useSubtitles } from '@ui/hooks/useSubtitles'
import { useAutoFraming } from '@ui/hooks/useAutoFraming'
import { renderStorage, shortsStorage, projectUseCase } from '@ui/video/composition'
import { saveShortsResultUseCase } from '@ui/shorts/composition'

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

  // Render consolidado y nombre del proyecto para reproducir/descargar el
  // recorte de cada short en ShortCard — se cargan una sola vez al entrar,
  // no se editan desde esta pantalla (solo lectura). El short siempre se
  // recorta de este único archivo, nunca del timeline multi-clip en vivo.
  const [render, setRender] = useState<Render | null>(null)
  const [projectName, setProjectName] = useState('')
  const [cropOffsetXByShort, setCropOffsetXByShort] = useState<Record<string, number>>({})
  const [autoFrameEnabledByShort, setAutoFrameEnabledByShort] = useState<Record<string, boolean>>({})
  const [autoFramingByShort, setAutoFramingByShort] = useState<Record<string, AutoFrameKeyframe[]>>({})
  const [motionExcludeRect, setMotionExcludeRect] = useState<NormalizedRect | null>(null)
  const [analyzingShortKey, setAnalyzingShortKey] = useState<string | null>(null)
  const [persistError, setPersistError] = useState<string | null>(null)
  const { analyzeState, analyzeAndSave, setAutoFrameEnabled, setMotionExcludeRectAndClearAutoFraming } = useAutoFraming()

  // Cambiar la región del avatar invalida cualquier trayectoria de
  // auto-encuadre ya calculada (se calculó ignorando la región vieja, ya no
  // es correcta) — setMotionExcludeRectAndClearAutoFraming la descarta en la
  // misma escritura (ver su contrato en ShortsStoragePort), acá se refleja
  // lo mismo en memoria. Los shorts con autoFrameEnabled siguen activados:
  // solo les falta volver a calcularse (el botón de recalcular queda
  // visible en cada ShortCard).
  const handleChangeMotionExcludeRect = useCallback(
    (rect: NormalizedRect | null) => {
      if (!projectId) return
      setMotionExcludeRect(rect)
      setAutoFramingByShort({})
      void setMotionExcludeRectAndClearAutoFraming(projectId, rect)
    },
    [projectId, setMotionExcludeRectAndClearAutoFraming],
  )

  useEffect(() => {
    if (!projectId) return
    void renderStorage.getByProject(projectId).then((result) => {
      if (result.ok) setRender(result.value)
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
    void Promise.all([shortsStorage.getByProject(projectId), renderStorage.getByProject(projectId)]).then(
      ([shortsResult, renderResult]) => {
        if (!shortsResult.ok || !shortsResult.value) return
        const currentRenderId = renderResult.ok && renderResult.value ? renderResult.value.id : null
        shortsState.loadPersisted(shortsResult.value, currentRenderId)
        setCropOffsetXByShort(shortsResult.value.cropOffsetXByShort ?? {})
        setAutoFrameEnabledByShort(shortsResult.value.autoFrameEnabledByShort ?? {})
        setAutoFramingByShort(shortsResult.value.autoFramingByShort ?? {})
        setMotionExcludeRect(shortsResult.value.motionExcludeRect ?? null)
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
  // SaveShortsResultUseCase genera el render si todavía no existía (ver
  // EnsureRenderUseCase) — el estado local `render` de esta pantalla, leído
  // una sola vez al montar, nunca se enteraba de ese render nuevo, así que
  // la grilla (que exige `render` no nulo) quedaba sin mostrarse hasta
  // recargar la página. Por eso se vuelve a leer acá, apenas se confirma
  // que el guardado terminó bien.
  const persistedRef = useRef<typeof shortsState.shorts | null>(null)
  useEffect(() => {
    if (!shortsState.justCreated) return
    if (shortsState.createShortsState !== 'success') return
    if (shortsState.shorts.length === 0) return
    if (persistedRef.current === shortsState.shorts) return
    persistedRef.current = shortsState.shorts
    if (!projectId) return
    void saveShortsResultUseCase.execute(projectId, shortsState.shorts, shortsState.warnings).then((result) => {
      if (!result.ok) {
        setPersistError('No se pudieron guardar los shorts generados. Verifica el espacio de almacenamiento disponible.')
        return
      }
      void renderStorage.getByProject(projectId).then((renderResult) => {
        if (renderResult.ok) setRender(renderResult.value)
      })
    })
  }, [shortsState.justCreated, shortsState.createShortsState, shortsState.shorts, shortsState.warnings, projectId])

  const handleUpdateCropOffset = useCallback(
    (short: { startMs: number; endMs: number }, cropOffsetX: number) => {
      if (!projectId) return
      const key = shortKey(short)
      setCropOffsetXByShort((prev) => ({ ...prev, [key]: cropOffsetX }))
      void shortsStorage.updateCropOffset(projectId, key, cropOffsetX).then((result) => {
        if (!result.ok) {
          setPersistError('No se pudo guardar el ajuste de encuadre.')
        }
      })
    },
    [projectId],
  )

  const handleToggleAutoFrame = useCallback(
    (short: { startMs: number; endMs: number }, enabled: boolean) => {
      if (!projectId) return
      const key = shortKey(short)
      setAutoFrameEnabledByShort((prev) => ({ ...prev, [key]: enabled }))
      void setAutoFrameEnabled(projectId, key, enabled)
    },
    [projectId, setAutoFrameEnabled],
  )

  // Cola secuencial: cada análisis decodifica el render completo del
  // proyecto, así que nunca deben correr dos a la vez — ni cuando varias
  // ShortCard disparan su propio análisis automático al montarse juntas
  // (ver useEffect en ShortCard.tsx) ni cuando eso coincide con
  // "Reencuadrar todos" (CreateShortsTool.handleReframeAll). Encolar acá,
  // en el único lugar que de verdad invoca analyzeAndSave, es la fuente de
  // verdad — no depende de que cada caller coordine entre sí.
  const analysisQueueRef = useRef<Promise<unknown>>(Promise.resolve())

  const handleAnalyzeAutoFrame = useCallback(
    (short: { startMs: number; endMs: number }): Promise<boolean> => {
      const run = async (): Promise<boolean> => {
        if (!projectId || !render) return false
        const key = shortKey(short)
        setAnalyzingShortKey(key)
        const keyframes = await analyzeAndSave(projectId, key, render, short.startMs, short.endMs, motionExcludeRect)
        setAnalyzingShortKey(null)
        if (keyframes) {
          setAutoFramingByShort((prev) => ({ ...prev, [key]: keyframes }))
          return true
        }
        setPersistError('No se pudo calcular el encuadre automático de uno de los shorts. Intenta de nuevo.')
        return false
      }
      const next = analysisQueueRef.current.then(run)
      analysisQueueRef.current = next
      return next
    },
    [projectId, render, motionExcludeRect, analyzeAndSave],
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
        <Link
          to={`/projects/${projectId}/publish`}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-strong hover:bg-surface-hover"
        >
          Publicar
        </Link>
      </div>

      {persistError && <ErrorBanner>{persistError}</ErrorBanner>}

      <CreateShortsTool
        hasAccess={hasShortsAccess}
        hasSubtitles={!!subtitlesState.subtitles && subtitlesState.subtitles.segments.length > 0}
        state={shortsState.createShortsState}
        error={shortsState.createShortsError}
        shorts={shortsState.shorts}
        warnings={shortsState.warnings}
        isStale={shortsState.isStale}
        onCreateShorts={handleCreateShorts}
        render={render}
        subtitleSegments={subtitlesState.subtitles?.segments ?? []}
        projectId={projectId}
        projectName={projectName}
        cropOffsetXByShort={cropOffsetXByShort}
        onUpdateCropOffset={handleUpdateCropOffset}
        autoFrameEnabledByShort={autoFrameEnabledByShort}
        autoFramingByShort={autoFramingByShort}
        analyzingShortKey={analyzingShortKey}
        analyzeState={analyzeState}
        onToggleAutoFrame={handleToggleAutoFrame}
        onAnalyzeAutoFrame={handleAnalyzeAutoFrame}
        motionExcludeRect={motionExcludeRect}
        onChangeMotionExcludeRect={handleChangeMotionExcludeRect}
      />
    </div>
  )
}
