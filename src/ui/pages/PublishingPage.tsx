import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { shortKey } from '@domain/shorts'
import { isPublishingResultNotification, toPublishItemResultFromNotification, type MetadataContext, type PublishItemStatus } from '@domain/publishing'
import { platformLabel, isPublishableViaApi, type PublishingPlatform } from '@domain/platform'
import { useAuth } from '@ui/auth/useAuth'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { Button } from '@ui/components/Button'
import { ConfirmDialog } from '@ui/components/ConfirmDialog'
import { PremiumNotice } from '@ui/billing/PremiumNotice'
import { PublishItemCard } from '@ui/components/PublishItemCard'
import { PublishSchedule } from '@ui/components/PublishSchedule'
import { GenerateMetadataModal } from '@ui/components/GenerateMetadataModal'
import { usePublish, type PublishSeriesItem } from '@ui/hooks/usePublish'
import { useTikTokCapabilities } from '@ui/hooks/useTikTokCapabilities'
import { shortsStorage, projectUseCase } from '@ui/video/composition'
import { timelineStorage } from '@ui/timeline/composition'
import { subtitlesStorage } from '@ui/subtitles/composition'
import { useConnectPlatform } from '@ui/publishing/useConnectPlatform'
import { publishingStorage, publishingUseCase } from '@ui/publishing/composition'
import { PUBLISHING_ERROR_MESSAGES } from '@ui/publishing/errorMessages'
import { useNotifications } from '@ui/notifications/useNotifications'
import type { Timeline } from '@domain/timeline'
import type { ShortScore } from '@domain/shorts'
import type { Subtitles } from '@domain/subtitles'

const MAX_ITEMS_PER_BULK = 10

type WizardStep = 'metadata' | 'publish'

/** Switch exhaustivo (no un array de strings) — si PublishItemStatus gana un valor nuevo, TS obliga a decidir explícitamente si cuenta como "ya publicado" en vez de quedar desactualizado en silencio. */
function isAlreadyPublishedStatus(status: PublishItemStatus): boolean {
  switch (status) {
    case 'uploaded':
    case 'scheduled':
    case 'inbox':
      return true
    case 'uploading':
    case 'awaiting_result':
    case 'skipped':
    case 'failed':
    case 'unknown':
      return false
  }
}

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
 * El backend exige context.subtitles no vacío (400 MISSING_SUBTITLES) — si
 * no hay subtítulos reales para este tramo, no existe context válido:
 * devuelve undefined en vez de un objeto con subtitles vacío/faltante.
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

  if (inRange.length === 0) return undefined

  return {
    summary,
    subtitles: inRange.map((segment) => ({ start: segment.startMs / 1000, end: segment.endMs / 1000, text: segment.text })),
  }
}

export function PublishingPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { hasActiveFeature, youtubeConnected, youtubeChannelTitle, youtubeGoogleEmail, tiktokConnected, tiktokDisplayName, isLoading: isAuthLoading } =
    useAuth()
  const hasAiAccess = hasActiveFeature('youtube_ai')
  const { capabilities: tikTokCapabilities, error: tikTokCapabilitiesError, refresh: refreshTikTokCapabilities } = useTikTokCapabilities()
  const tikTokPublishable = isPublishableViaApi(tikTokCapabilities)

  const [step, setStep] = useState<WizardStep>('metadata')
  const [projectName, setProjectName] = useState('')
  const [hasTimeline, setHasTimeline] = useState(false)
  const [shorts, setShorts] = useState<ShortScore[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false)
  const [manualLongVideoUrl, setManualLongVideoUrlState] = useState('')
  const [pendingPublishPlatforms, setPendingPublishPlatforms] = useState<PublishingPlatform[] | null>(null)
  const [activeBulkSourceIds, setActiveBulkSourceIds] = useState<string[] | null>(null)
  const [activeBulkPlatforms, setActiveBulkPlatforms] = useState<PublishingPlatform[]>([])
  const [isCancelingBulk, setIsCancelingBulk] = useState(false)
  const [bulkStatusError, setBulkStatusError] = useState<string | null>(null)
  // bulkUploadId del bulk más reciente de esta serie, visto en status === 'completed_with_failures'
  // — se necesita para el endpoint de reintentar (usa bulkUploadId, no seriesId, a diferencia de
  // cancelBulkUpload/getBulkUploadStatus que sí usan seriesId).
  const [failedBulkUploadId, setFailedBulkUploadId] = useState<string | null>(null)
  const [isRetryingFailed, setIsRetryingFailed] = useState(false)
  const connectPlatform = useConnectPlatform(`/projects/${projectId}/publish`)

  // Recuerda la última URL manual del video largo por proyecto (mismo storage del que se lee, ver
  // efecto de carga más abajo), para no tener que volver a pegarla cada vez que se publican shorts
  // sin el largo en el mismo lote — sigue siendo editable, solo se precarga como default.
  const setManualLongVideoUrl = (value: string) => {
    setManualLongVideoUrlState(value)
    if (!projectId) return
    void publishingUseCase.setManualLongVideoUrl(projectId, value.trim() || undefined)
  }

  const publishState = usePublish({ projectId: projectId ?? '', projectName })
  const { latestNotification, isStreamConnected } = useNotifications()

  // Refleja en memoria el resultado final de publicación apenas llega por SSE — sin esto, el estado
  // de cada card solo se actualiza al recargar la página (recordNotificationResult, llamado desde
  // NotificationsContext, solo persiste en IndexedDB). Ignora notificaciones de otro proyecto/serie.
  useEffect(() => {
    if (!latestNotification || !projectId) return
    if (!isPublishingResultNotification(latestNotification)) return
    const { projectId: notificationProjectId, sourceId, result } = toPublishItemResultFromNotification(latestNotification)
    if (notificationProjectId !== projectId) return
    publishState.applyNotificationResult(sourceId, result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestNotification, projectId])

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
            resultsByPlatform: {},
            requestedPlatforms: [],
            uploadProgress: null,
          }

          void Promise.all([shortsStorage.getByProject(projectId), publishingStorage.getByProject(projectId)]).then(
            ([shortsResult, publishingResult]) => {
              const projectShorts = shortsResult.ok ? shortsResult.value : null
              const persistedMetadata = publishingResult.ok ? publishingResult.value?.metadataBySourceId : undefined
              const persistedResults = publishingResult.ok ? publishingResult.value?.resultsByKey : undefined
              setManualLongVideoUrlState(publishingResult.ok ? (publishingResult.value?.manualLongVideoUrl ?? '') : '')
              const shortItems: PublishSeriesItem[] = (projectShorts?.shorts ?? []).map((short) => {
                const shortContext = toMetadataContext(subtitles, project?.description, { startMs: short.startMs, endMs: short.endMs })
                return {
                  sourceId: shortSourceId(projectId, short),
                  videoType: 'short',
                  score: short.score,
                  range: { startMs: short.startMs, endMs: short.endMs },
                  cropOffsetX: projectShorts?.cropOffsetXByShort?.[shortKey(short)],
                  // Sin subtítulos en este tramo no hay context válido (subtitles es obligatorio) —
                  // detectedReason/score solo se agregan si ya hay un context real que los sostenga.
                  context: shortContext ? { ...shortContext, detectedReason: short.reason, score: short.score } : undefined,
                  state: 'idle' as const,
                  revision: null,
                  error: null,
                  resultsByPlatform: {},
                  requestedPlatforms: [],
                  uploadProgress: null,
                }
              })
              setShorts(projectShorts?.shorts ?? [])
              const seriesItems = durationOk ? [longItem, ...shortItems] : shortItems
              publishState.initItems(seriesItems, persistedMetadata, persistedResults)
              // Por default se publica toda la serie — el usuario destilda lo que no quiera enviar.
              const defaultSelection = seriesItems.slice(0, MAX_ITEMS_PER_BULK)
              setSelected(new Set(defaultSelection.map((item) => item.sourceId)))
              // Si todos los items seleccionados por default YA tienen metadata generada de una
              // visita anterior, no tiene sentido obligar a pasar de nuevo por el paso 1 — se entra
              // directo a publicar. Si el usuario quiere regenerar algo, puede volver con el tab.
              if (defaultSelection.length > 0 && defaultSelection.every((item) => persistedMetadata?.[item.sourceId])) {
                setStep('publish')
              }
            },
          )
        },
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Flujo recomendado al reabrir una serie: consultar si quedó un bulk a medias (ej. la pestaña se
  // cerró con uploads en curso) para ofrecer "continuar" o "empezar de nuevo", o si quedó con
  // publicaciones fallidas para ofrecer "reintentar fallidos" — en vez de que el usuario tenga que
  // adivinar o simplemente perder el progreso. BULK_UPLOAD_NOT_FOUND es el único caso "esperado" de
  // error (nunca hubo un bulk, o ya expiró) — cualquier otro código (incluido un 401 de sesión caída)
  // se muestra explícito con botón de reintentar: tragarlo en silencio dejaría items en
  // 'awaiting_result' sin que el usuario sepa que ni siquiera se pudo consultar su estado real.
  // El GET encuentra el bulk sin importar su estado (activo, terminado, con fallos) — por eso este
  // mismo chequeo cubre ambos casos, no hace falta un endpoint ni un flujo separado.
  const checkBulkStatus = useCallback(async () => {
    if (!projectId) return
    setBulkStatusError(null)
    const result = await publishingUseCase.getBulkUploadStatus(projectId)
    if (!result.ok) {
      if (result.error.code !== 'BULK_UPLOAD_NOT_FOUND') {
        console.error('No se pudo consultar el estado del bulk upload:', result.error)
        setBulkStatusError(PUBLISHING_ERROR_MESSAGES[result.error.code])
      }
      return
    }
    if (result.value.status === 'active') {
      const uploadingItems = result.value.items.filter((item) => item.uploadStatus === 'uploading')
      if (uploadingItems.length > 0) {
        setActiveBulkSourceIds(uploadingItems.map((item) => item.sourceId))
        const platforms = new Set(uploadingItems.flatMap((item) => item.platforms.map((p) => p.platform)))
        setActiveBulkPlatforms([...platforms])
      }
      return
    }
    if (result.value.status === 'completed_with_failures') {
      setFailedBulkUploadId(result.value.bulkUploadId)
    }
  }, [projectId])

  // isAuthLoading: esperar a que termine de restaurarse la sesión antes de disparar este fetch — si
  // sale mientras AuthContext todavía está en restoreSession(), httpClient.accessToken sigue siendo
  // null en ese instante y el request sale sin Authorization, dando un 401 espurio que no refleja
  // que la sesión esté realmente caída (mismo patrón ya usado en GoogleCallbackPage).
  useEffect(() => {
    if (isAuthLoading) return
    void checkBulkStatus()
  }, [isAuthLoading, checkBulkStatus])

  if (!projectId) return null

  const allItems = Object.values(publishState.items)
  // Mientras el stream SSE esté caído, los items en 'awaiting_result' nunca van a recibir su
  // resultado final en esta pestaña (ver NotificationsStreamAdapter) — aunque la subida en sí haya
  // terminado bien. Sin este chequeo el usuario ve "esperando confirmación" para siempre sin saber
  // por qué, ni que el problema es la conexión y no la subida.
  const anyAwaitingResult = allItems.some((item) => item.state === 'awaiting_result')
  const overLimit = selected.size > MAX_ITEMS_PER_BULK
  const wizardRunning = publishState.metadataProgress !== null
  // Cualquier item seleccionado que todavía esté generando/regenerando metadata (individualmente, vía "Regenerar con feedback") bloquea publicar, no solo el wizard general.
  const anySelectedGenerating = [...selected].some((sourceId) => publishState.items[sourceId]?.state === 'generating')
  // No se puede publicar si algún seleccionado no tiene metadata generada todavía — bloquea el botón, no solo el intento de submit.
  const anySelectedWithoutMetadata = [...selected].some((sourceId) => !publishState.items[sourceId]?.revision)
  const anySelectedAlreadyPublished = [...selected].some((sourceId) =>
    Object.values(publishState.items[sourceId]?.resultsByPlatform ?? {}).some((result) => isAlreadyPublishedStatus(result.status)),
  )
  const canContinueToPublish = selected.size > 0 && !overLimit && !wizardRunning && !anySelectedGenerating && !anySelectedWithoutMetadata
  // Si se publica algún short sin el video largo en el mismo lote, el backend solo puede armar el
  // link "Mirá el video completo" si ya hay una URL persistida de una publicación previa, o si el
  // usuario la ingresa a mano (ej. el largo está publicado en otra plataforma).
  const anyShortSelected = [...selected].some((sourceId) => publishState.items[sourceId]?.videoType === 'short')
  const longVideoSelected = selected.has(projectId)
  const needsManualLongVideoUrl = anyShortSelected && !longVideoSelected

  function toggleSelected(sourceId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  // El contrato nuevo acepta un solo plan con varias plataformas a la vez
  // (platforms: PublishingPlatform[]) — un mismo archivo se sube una sola vez
  // aunque vaya a YouTube y TikTok, a diferencia del flujo viejo que llamaba
  // una vez por plataforma y duplicaba la subida.
  async function runPublish(platforms: PublishingPlatform[]) {
    await publishState.publish([...selected], platforms, manualLongVideoUrl)
    // El resultado final (y por lo tanto la URL real del largo, si se publicó en este envío) ya no
    // llega de forma síncrona acá — llega después por notificación SSE, ver NotificationsContext.
  }

  function publishTo(platforms: PublishingPlatform[]) {
    if (platforms.length === 0) return
    if (anySelectedAlreadyPublished) {
      setPendingPublishPlatforms(platforms)
      return
    }
    void runPublish(platforms)
  }

  // Reenviar el mismo plan (mismo seriesId/sourceId) resume automáticamente — no hace falta ningún
  // parámetro especial, el backend ya sabe qué falta subir (ver BulkUploadPlanUpload.uploadUrl).
  function continueActiveBulk() {
    if (!activeBulkSourceIds) return
    setSelected(new Set(activeBulkSourceIds))
    setStep('publish')
    const sourceIds = activeBulkSourceIds
    const platforms = activeBulkPlatforms
    setActiveBulkSourceIds(null)
    void publishState.publish(sourceIds, platforms, manualLongVideoUrl)
  }

  async function discardActiveBulk() {
    setIsCancelingBulk(true)
    await publishState.cancelActiveUpload()
    setIsCancelingBulk(false)
    setActiveBulkSourceIds(null)
  }

  // 204 sin body — no hay resultado síncrono que reflejar, hay que volver a consultar
  // getBulkUploadStatus para ver si el reintento terminó en éxito o en un nuevo fallo.
  async function retryFailed() {
    if (!failedBulkUploadId) return
    setIsRetryingFailed(true)
    const result = await publishingUseCase.retryFailedPublications(failedBulkUploadId)
    if (!result.ok) {
      console.error('No se pudo reintentar las publicaciones fallidas:', result.error)
      setBulkStatusError(PUBLISHING_ERROR_MESSAGES[result.error.code])
      setIsRetryingFailed(false)
      return
    }
    setFailedBulkUploadId(null)
    setIsRetryingFailed(false)
    void checkBulkStatus()
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-3 p-4 sm:p-6 sm:pb-4">
        <div className="flex items-center gap-2">
          <Link
            to={`/projects/${projectId}/shorts`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-strong hover:bg-surface-hover"
            aria-label="Volver a shorts"
            title="Volver a shorts"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold text-text-strong">Publicar</h1>
        </div>

        {/* Tabs del wizard — único mecanismo de navegación entre pasos, el tab 2 solo se habilita cuando el paso 1 ya está completo (mismo guard que el botón "Continuar"). */}
        <div className="flex gap-2 text-sm font-medium">
          <button
            type="button"
            onClick={() => setStep('metadata')}
            className={`flex-1 rounded-lg border-2 px-3 py-2 text-center transition-colors ${step === 'metadata' ? 'border-accent-border bg-accent-bg text-accent' : 'border-border text-text-muted hover:text-text-strong'}`}
          >
            1. Generar metadatos
          </button>
          <button
            type="button"
            disabled={canContinueToPublish === false}
            onClick={() => setStep('publish')}
            className={`flex-1 rounded-lg border-2 px-3 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${step === 'publish' ? 'border-accent-border bg-accent-bg text-accent' : 'border-border text-text-muted hover:text-text-strong'}`}
          >
            2. Exportar y publicar
          </button>
        </div>

        {!hasTimeline && shorts.length === 0 && (
          <ErrorBanner variant="warning">Este proyecto no tiene timeline ni shorts para publicar.</ErrorBanner>
        )}

        {step === 'publish' && !youtubeConnected && (
          <ErrorBanner variant="warning">
            Todavía no conectaste tu cuenta de YouTube.{' '}
            <button
              type="button"
              className="cursor-pointer font-medium text-accent hover:underline"
              onClick={() => void connectPlatform('youtube')}
            >
              Conectar YouTube
            </button>
          </ErrorBanner>
        )}

        {step === 'publish' && !tikTokPublishable && (
          <ErrorBanner variant="warning">
            {tikTokCapabilitiesError
              ? `No se pudo consultar el estado de TikTok: ${PUBLISHING_ERROR_MESSAGES[tikTokCapabilitiesError.code]}`
              : tiktokConnected
                ? 'La publicación por API a TikTok no está disponible ahora mismo.'
                : 'Todavía no conectaste tu cuenta de TikTok.'}{' '}
            {!tiktokConnected && !tikTokCapabilitiesError ? (
              <button
                type="button"
                className="cursor-pointer font-medium text-accent hover:underline"
                onClick={() => void connectPlatform('tiktok')}
              >
                Conectar TikTok
              </button>
            ) : (
              <button
                type="button"
                className="cursor-pointer font-medium text-accent hover:underline"
                onClick={() => void refreshTikTokCapabilities()}
              >
                Reintentar
              </button>
            )}
          </ErrorBanner>
        )}

        {overLimit && <ErrorBanner>Máximo {MAX_ITEMS_PER_BULK} videos por envío.</ErrorBanner>}

        {publishState.publishError && <ErrorBanner>{publishState.publishError}</ErrorBanner>}

        {bulkStatusError && (
          <ErrorBanner>
            <div className="flex items-center justify-between gap-2">
              <span>{bulkStatusError}</span>
              <button
                type="button"
                className="shrink-0 cursor-pointer font-medium underline"
                onClick={() => void checkBulkStatus()}
              >
                Reintentar
              </button>
            </div>
          </ErrorBanner>
        )}

        {!isStreamConnected && anyAwaitingResult && (
          <ErrorBanner variant="warning">
            Se perdió la conexión en tiempo real — la subida pudo haber terminado bien, pero esta
            pestaña no va a enterarse del resultado hasta que vuelva la conexión. Recargá la página
            más tarde para ver el estado actualizado.
          </ErrorBanner>
        )}

        {activeBulkSourceIds && (
          <ErrorBanner variant="warning">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Quedó una subida sin terminar de {activeBulkSourceIds.length === 1 ? 'un video' : `${activeBulkSourceIds.length} videos`} de
                esta serie.
              </span>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="secondary" disabled={isCancelingBulk} onClick={() => void discardActiveBulk()}>
                  {isCancelingBulk ? 'Cancelando…' : 'Empezar de nuevo'}
                </Button>
                <Button type="button" disabled={isCancelingBulk} onClick={continueActiveBulk}>
                  Continuar subiendo
                </Button>
              </div>
            </div>
          </ErrorBanner>
        )}

        {failedBulkUploadId && (
          <ErrorBanner>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>Alguna publicación de esta serie falló.</span>
              <Button type="button" disabled={isRetryingFailed} onClick={() => void retryFailed()}>
                {isRetryingFailed ? 'Reintentando…' : 'Reintentar fallidos'}
              </Button>
            </div>
          </ErrorBanner>
        )}
      </div>

      {/* Única zona con scroll — header y footer quedan siempre visibles, sin sticky: el contenedor
          raíz ya reserva su propia altura (h-full) y reparte header/contenido/footer con flex. El
          scroll ocupa TODO el ancho (si no, su propia scrollbar queda flotando lejos del borde real
          de la pantalla) — el centrado en columna de lectura va en el div hijo, que no scrollea. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        {step === 'metadata' && (
          <div className="flex flex-col gap-4 pb-4">
            {!hasAiAccess && <PremiumNotice />}

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
          </div>
        )}

        {step === 'publish' && (
          <div className="flex flex-col gap-4 pb-4">
            <PublishSchedule
              longVideoPublishDay={publishState.longVideoPublishDay}
              onChange={publishState.setLongVideoPublishDay}
              isScheduled={allItems.some((item) => Object.values(item.resultsByPlatform).some((result) => result.status === 'scheduled'))}
            />

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

            {needsManualLongVideoUrl && (
              <label className="flex flex-col gap-1 rounded-lg border border-border p-4 text-sm">
                <span className="font-medium text-text-strong">URL del video completo (opcional)</span>
                <span className="text-text-muted">
                  Estás publicando shorts sin el video largo en este envío. Si ya publicaste el video completo en
                  alguna plataforma, pegá el link acá para que se incluya en la descripción de los shorts.
                </span>
                <input
                  type="url"
                  value={manualLongVideoUrl}
                  onChange={(event) => setManualLongVideoUrl(event.target.value)}
                  placeholder="https://..."
                  className="mt-1 rounded-lg border border-border bg-bg px-3 py-2 text-text-strong outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-bg"
                />
              </label>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Footer de acciones — siempre visible, nunca se desplaza con el scroll del contenido. El
          botón de avanzar/publicar es lo más importante de cada paso, por eso vive acá fijo y no
          al final de una lista que puede crecer. El fondo ocupa todo el ancho (igual que TopBar);
          el contenido interno queda centrado en la misma columna de lectura que header y contenido. */}
      <div className="shrink-0 border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        {step === 'metadata' && (
          <div className="flex flex-col gap-3">
            {anySelectedWithoutMetadata && (
              <ErrorBanner variant="warning">
                Generá los metadatos de todos los videos seleccionados antes de continuar.
              </ErrorBanner>
            )}

            {/* Si ya hay metadata lista para todo lo seleccionado, la acción principal de este paso
                pasa a ser avanzar — "generar" ya no es necesario, así que se degrada a link secundario
                para quien de verdad quiera volver a generarla. Si falta metadata, es al revés: generar
                es la única acción posible todavía, domina sola. Nunca se muestran ambas al mismo peso. */}
            <Button
              type="button"
              className="py-4 text-base"
              disabled={canContinueToPublish ? wizardRunning : !hasAiAccess || wizardRunning || selected.size === 0}
              onClick={() => (canContinueToPublish ? setStep('publish') : setIsMetadataModalOpen(true))}
            >
              {wizardRunning ? (
                `Generando metadatos… (${publishState.metadataProgress?.done}/${publishState.metadataProgress?.total})`
              ) : canContinueToPublish ? (
                <span className="flex items-center justify-center gap-2">
                  Continuar a publicar
                  <ArrowRight className="h-4 w-4" />
                </span>
              ) : (
                'Generar metadatos con IA'
              )}
            </Button>

            {canContinueToPublish && !wizardRunning && (
              <button
                type="button"
                disabled={!hasAiAccess || selected.size === 0}
                onClick={() => setIsMetadataModalOpen(true)}
                className="text-center text-xs font-medium text-text-muted hover:text-text-strong hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Regenerar metadatos
              </button>
            )}
          </div>
        )}

        {step === 'publish' && (
          <div className="flex flex-col gap-3">
            {/* Acción principal: dominante, ancho completo, alta — todo lo demás en este footer es secundario a esto. */}
            <Button
              type="button"
              className="py-4 text-base"
              disabled={
                selected.size === 0 ||
                overLimit ||
                wizardRunning ||
                anySelectedGenerating ||
                anySelectedWithoutMetadata ||
                publishState.isPublishing ||
                (!youtubeConnected && !tikTokPublishable)
              }
              onClick={() =>
                publishTo(
                  [youtubeConnected ? 'youtube' : null, tikTokPublishable ? 'tiktok' : null].filter(
                    (p): p is PublishingPlatform => p !== null,
                  ),
                )
              }
            >
              {publishState.isPublishing ? 'Publicando…' : 'Publicar en YouTube y TikTok'}
            </Button>

            {/* Alternativas de publicar a una sola plataforma — deliberadamente discretas (texto, sin
                fondo ni borde fuerte) para que nunca compitan visualmente con la acción principal. */}
            <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
              <button
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
                onClick={() => publishTo(['youtube'])}
                className="font-medium hover:text-text-strong hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Solo {platformLabel('youtube')}
                {youtubeConnected && (youtubeChannelTitle || youtubeGoogleEmail) && ` (${youtubeChannelTitle ?? youtubeGoogleEmail})`}
              </button>
              <span className="text-border">·</span>
              <button
                type="button"
                disabled={
                  selected.size === 0 ||
                  overLimit ||
                  wizardRunning ||
                  anySelectedGenerating ||
                  anySelectedWithoutMetadata ||
                  publishState.isPublishing ||
                  !tikTokPublishable
                }
                onClick={() => publishTo(['tiktok'])}
                className="font-medium hover:text-text-strong hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Solo {platformLabel('tiktok')}
                {tiktokConnected && tiktokDisplayName && ` (${tiktokDisplayName})`}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {isMetadataModalOpen && (
        <GenerateMetadataModal
          onGenerate={(input) => void publishState.generateAllMetadata([...selected], input)}
          onClose={() => setIsMetadataModalOpen(false)}
        />
      )}

      {pendingPublishPlatforms && (
        <ConfirmDialog
          title="Volver a publicar"
          message="Algunos videos seleccionados ya fueron publicados. ¿Querés volver a publicarlos?"
          confirmLabel="Publicar de nuevo"
          onConfirm={() => {
            const platforms = pendingPublishPlatforms
            setPendingPublishPlatforms(null)
            void runPublish(platforms)
          }}
          onCancel={() => setPendingPublishPlatforms(null)}
        />
      )}
    </div>
  )
}
