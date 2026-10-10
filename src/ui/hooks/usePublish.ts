import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type MetadataContext,
  type MetadataRevision,
  type PublishedMetadataRecord,
  type PublishedResultRecord,
  type PublishItemPlan,
  type PublishItemResult,
} from '@domain/publishing'
import type { PublishingPlatform } from '@domain/platform'
import type { PublishingErrorCode } from '@application/publishing/errors'
import type { TusUploadError } from '@infrastructure/publishing/tusUploadAdapter'
import { PUBLISHING_ERROR_MESSAGES } from '@ui/publishing/errorMessages'
import { publishingUseCase, publishBlobStorage } from '@ui/publishing/composition'
import { startPlatformOAuth } from '@ui/publishing/oauth'
import { useExport, type ExportFailure } from '@ui/hooks/useExport'
import {
  DEFAULT_EXPORT_OPTIONS,
  fileExtensionFor,
  SHORT_EXPORT_OPTIONS,
  type ExportOptions,
} from '@application/video/exportTypes'

/**
 * Tope de subidas simultáneas — subir TODOS los archivos de un bulk en
 * paralelo sin límite (como antes) acumula varios Blob leídos y sus buffers
 * de red en memoria a la vez, lo que puede agotar la RAM en equipos modestos
 * con bulks de varios shorts pesados. 2 a la vez balancea aprovechar algo de
 * paralelismo real sin que el pico de memoria escale con el tamaño del bulk.
 */
const MAX_CONCURRENT_UPLOADS = 2

export type PublishItemState =
  | 'idle'
  | 'generating'
  | 'ready'
  | 'exporting'
  /** Local, nunca lo manda el backend: este item ya terminó de exportarse (su blob está listo), pero la exportación de la serie es secuencial (un item a la vez, ver loop en publish()) y todavía faltan otros por exportar antes de poder declarar el plan y empezar a subir. */
  | 'exported'
  | 'uploading'
  | 'awaiting_result'
  | 'uploaded'
  | 'scheduled'
  | 'inbox'
  | 'skipped'
  | 'failed'
  | 'unknown'

export const PublishItemFailureKind = {
  Metadata: 'Metadata',
  Export: 'Export',
  Request: 'Request',
  Upload: 'Upload',
} as const

/**
 * Errores de un item de la serie vienen de cuatro orígenes distintos con
 * vocabularios propios (metadata IA, export de video, fallo del plan de
 * bulk-upload a nivel request completo, fallo de la subida TUS por-item) —
 * un solo string plano perdía esa distinción y mostraba códigos técnicos
 * crudos al usuario. Cada variante trae su propio código tipado para que el
 * consumidor (PublishItemCard) elija el mensaje correcto.
 */
export type PublishItemFailure =
  | { kind: typeof PublishItemFailureKind.Metadata; code: PublishingErrorCode }
  | { kind: typeof PublishItemFailureKind.Export; failure: ExportFailure }
  | { kind: typeof PublishItemFailureKind.Request; code: PublishingErrorCode }
  | { kind: typeof PublishItemFailureKind.Upload; error: TusUploadError }

export interface PublishSeriesItemBase {
  sourceId: string
  context?: MetadataContext
  /** Fase local del pipeline de este item (export/subida), compartida entre plataformas porque el archivo se sube una sola vez aunque el plan cubra varias. El resultado final de CADA plataforma vive aparte en resultsByPlatform — un mismo sourceId puede estar 'uploaded' en YouTube y 'failed' en TikTok a la vez, cosa que un solo campo `state` no puede representar. */
  state: PublishItemState
  revision: MetadataRevision | null
  error: PublishItemFailure | null
  /** Resultado de publicación por plataforma — una entrada por cada plataforma a la que se intentó publicar este sourceId (ver PublishedResultRecord, keyed por platform::sourceId en el storage). */
  resultsByPlatform: Partial<Record<PublishingPlatform, PublishItemResult>>
  /** Plataformas que el plan vigente pidió para este sourceId — set por publish() antes de exportar/subir. Vacío si este item nunca entró en un plan (sin publicar todavía). Necesario para que PublishItemCard sepa cuántos resultsByPlatform debe esperar antes de considerar el item resuelto: Object.keys(resultsByPlatform) por sí solo solo contiene las plataformas que YA respondieron, no las pedidas. */
  requestedPlatforms: PublishingPlatform[]
  /** 0–100, solo tiene sentido mientras state === 'uploading'/'exporting' — progreso real reportado por tus-js-client (onProgress) o por useExport, a diferencia del upload viejo (fetch+FormData) que no podía reportar nada. */
  uploadProgress: number | null
}

/** Campos mutables por setItem — sourceId es el identificador del registro, nunca se reasigna vía parche. */
type MutablePublishSeriesItemFields = Omit<PublishSeriesItemBase, 'sourceId'>

export interface PublishLongSeriesItem extends PublishSeriesItemBase {
  videoType: 'long'
}

export interface PublishShortSeriesItem extends PublishSeriesItemBase {
  videoType: 'short'
  score: number
  range: { startMs: number; endMs: number }
  cropOffsetX?: number
}

export type PublishSeriesItem = PublishLongSeriesItem | PublishShortSeriesItem

interface UsePublishParams {
  projectId: string
  projectName: string
}

export interface MetadataWizardInput {
  topic: string
  tone: string
  additionalInstructions: string
}

/** Pausa entre llamadas de generate-metadata del wizard — evita ráfagas contra el backend cuando la serie tiene varios shorts. */
const METADATA_GENERATION_DELAY_MS = 800

function exportOptionsFor(item: PublishSeriesItem): ExportOptions {
  return item.videoType === 'short' ? SHORT_EXPORT_OPTIONS : DEFAULT_EXPORT_OPTIONS
}

/** Requiere revision ya garantizado no-nulo por el caller (ver guard en publish()) — el tipo de retorno no-nulo refleja que no hay ningún caso real donde esto deba filtrarse en silencio. */
type PublishSeriesItemWithRevision = PublishSeriesItem & { revision: MetadataRevision }

function hasRevision(item: PublishSeriesItem): item is PublishSeriesItemWithRevision {
  return item.revision !== null
}

/**
 * longVideoInSameBatch: true si el video largo asociado a este short viaja en el
 * mismo plan (seleccionado junto al short) — en ese caso el backend resuelve el
 * link solo y no hace falta mandar longVideoUrl.
 * longVideoKnownUrl: URL ya resuelta del largo (del registro persistido de una
 * publicación previa a alguna de las plataformas del plan) — se manda solo si
 * el largo no viaja en este plan y hay una URL conocida.
 * priority: hoy no se calcula nada especial — null, el backend lo trata como
 * "sin preferencia" (campo obligatorio en el JSON, pero el valor en sí puede ser null).
 */
function toPublishItemPlan(
  item: PublishSeriesItemWithRevision,
  videoSizeBytes: number,
  longVideoInSameBatch: boolean,
  longVideoKnownUrl: string | null,
  platforms: PublishingPlatform[],
): PublishItemPlan {
  const platformOptionsByPlatform: PublishItemPlan['platformOptionsByPlatform'] = {}
  for (const platform of platforms) {
    platformOptionsByPlatform[platform] = platform === 'tiktok' ? { privacyLevel: 'PUBLIC_TO_EVERYONE' } : null
  }
  return {
    sourceId: item.sourceId,
    videoType: item.videoType,
    metadataRevisionId: item.revision.revisionId,
    videoSizeBytes,
    priority: null,
    longVideoTimestampSec: item.videoType === 'short' ? Math.round(item.range.startMs / 1000) : null,
    longVideoUrl: item.videoType === 'short' && !longVideoInSameBatch ? longVideoKnownUrl : null,
    platformOptionsByPlatform,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** context.subtitles es obligatorio y no vacío para el backend (400 MISSING_SUBTITLES si falta) — se valida acá antes de llamar para no gastar una request inválida y para que el item quede marcado con el mismo código de error tipado que devolvería el backend. Type guard (no solo boolean) para que el caller no necesite castear item.context luego de este chequeo. */
function hasRequiredSubtitles(item: PublishSeriesItem): item is PublishSeriesItem & { context: MetadataContext } {
  return !!item.context?.subtitles && item.context.subtitles.length > 0
}

export function usePublish({ projectId, projectName }: UsePublishParams) {
  const [items, setItems] = useState<Record<string, PublishSeriesItem>>({})
  const [longVideoPublishDay, setLongVideoPublishDay] = useState('')
  const [publishError, setPublishError] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  // Progreso del wizard de metadata: {done, total} mientras corre, null cuando no hay generación en curso.
  const [metadataProgress, setMetadataProgress] = useState<{ done: number; total: number } | null>(null)
  const { exportProjectToBlob, progress: exportProgress } = useExport()
  // sourceId del item que se está exportando en este momento — las exportaciones de la serie son
  // estrictamente secuenciales (un for con await, ver publish), así que una sola
  // instancia de useExport (progress global, no por item) alcanza: este ref apunta siempre al
  // único item activo, y el efecto de abajo refleja su progress en el item correspondiente.
  const exportingSourceIdRef = useRef<string | null>(null)

  // Solo acepta parches sobre los campos comunes a long/short (nunca score/range/cropOffsetX,
  // exclusivos de PublishShortSeriesItem) — evita el cast que hacía falta antes para
  // reconciliar Partial<PublishSeriesItem> (una unión discriminada) con el estado real.
  const setItem = useCallback((sourceId: string, update: Partial<MutablePublishSeriesItemFields>) => {
    setItems((prev) => {
      const current = prev[sourceId]
      if (!current) return prev
      return { ...prev, [sourceId]: { ...current, ...update } }
    })
  }, [])

  // Refleja en memoria el resultado de una notificación SSE ya procesada (ver
  // toPublishItemResultFromNotification) — sin esto, PublishingPage solo se entera del resultado
  // final tras recargar la página, porque recordNotificationResult (PublishingUseCase) solo persiste
  // en IndexedDB, no toca el estado de React. No pisa el resto de resultsByPlatform: cada plataforma
  // de un mismo sourceId llega en una notificación aparte (ver nota de la skill sobre notificaciones
  // unificadas: "si un bulk fue a varias plataformas, van a llegar varias notificaciones").
  const applyNotificationResult = useCallback((sourceId: string, result: PublishItemResult) => {
    setItems((prev) => {
      const current = prev[sourceId]
      if (!current) return prev
      return { ...prev, [sourceId]: { ...current, resultsByPlatform: { ...current.resultsByPlatform, [result.platform]: result } } }
    })
  }, [])

  // Refleja el progress de useExport (0-100, global al hook) sobre el item que se está exportando
  // en este momento — mismo campo uploadProgress que usa la barra de la fase de subida, porque
  // nunca coexisten (un item está 'exporting' O 'uploading', nunca ambos).
  useEffect(() => {
    const sourceId = exportingSourceIdRef.current
    if (!sourceId) return
    setItem(sourceId, { uploadProgress: exportProgress })
  }, [exportProgress, setItem])

  // Aplica la metadata y los resultados persistidos sobre cada item recién
  // armado — sin esto, recargar la pantalla pierde la metadata ya generada y
  // no hay forma de saber si un source ya se publicó antes. La metadata es
  // UNA sola por sourceId (compartida entre plataformas); persistedResults
  // trae TODAS las plataformas juntas (keyed por `${platform}::${sourceId}`,
  // ver publishedResultKey) — acá se reparte cada entrada a su sourceId,
  // agrupando por plataforma en resultsByPlatform.
  const initItems = useCallback(
    (
      seriesItems: PublishSeriesItem[],
      persistedMetadata?: Record<string, PublishedMetadataRecord>,
      persistedResults?: Record<string, PublishedResultRecord>,
    ) => {
      const withPersisted = seriesItems.map((item) => {
        const metadataRecord = persistedMetadata?.[item.sourceId]
        const resultsByPlatform: Partial<Record<PublishingPlatform, PublishItemResult>> = {}
        for (const record of Object.values(persistedResults ?? {})) {
          if (record.sourceId === item.sourceId) resultsByPlatform[record.platform] = record.result
        }
        if (!metadataRecord && Object.keys(resultsByPlatform).length === 0) return item
        // El spread sobre `item` (una unión discriminada) preserva su rama
        // concreta (PublishLongSeriesItem o PublishShortSeriesItem) porque
        // TypeScript infiere el tipo de retorno del literal, no de PublishSeriesItem —
        // no hace falta bifurcar por videoType para que el tipo quede bien inferido.
        return {
          ...item,
          revision: metadataRecord?.revision ?? item.revision,
          resultsByPlatform,
          state: metadataRecord ? ('ready' as const) : item.state,
        }
      })
      setItems(Object.fromEntries(withPersisted.map((item) => [item.sourceId, item])))
    },
    [],
  )

  // Genera metadata para todos los sourceIds en secuencia (no en paralelo) con
  // un delay entre llamadas — es un wizard de un solo paso para toda la serie,
  // no un botón por item: el usuario llena topic/tone/additionalInstructions
  // una sola vez y estos se reenvían igual para cada item, dejando que el
  // backend infiera lo que falte a partir del context propio de cada uno.
  // Cada resultado se persiste apenas llega (ver publishingStorage.upsertMetadata
  // más abajo) para sobrevivir a recargar PublishingPage. La metadata es UNA
  // sola, compartida entre plataformas — no depende de a cuál se vaya a publicar.
  const generateAllMetadata = useCallback(
    async (sourceIds: string[], input: MetadataWizardInput) => {
      setMetadataProgress({ done: 0, total: sourceIds.length })
      for (let index = 0; index < sourceIds.length; index += 1) {
        const sourceId = sourceIds[index]
        const item = items[sourceId]
        if (!item) continue

        if (!hasRequiredSubtitles(item)) {
          setItem(sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Metadata, code: 'MISSING_SUBTITLES' } })
          setMetadataProgress({ done: index + 1, total: sourceIds.length })
          continue
        }

        setItem(sourceId, { state: 'generating', error: null })
        const result = await publishingUseCase.generateMetadata(projectId, {
          sourceId,
          topic: input.topic.trim() || undefined,
          tone: input.tone.trim() || undefined,
          additionalInstructions: input.additionalInstructions.trim() || undefined,
          context: item.context,
        })
        if (!result.ok) {
          setItem(sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Metadata, code: result.error.code } })
        } else {
          setItem(sourceId, { state: 'ready', revision: result.value, error: null })
        }

        setMetadataProgress({ done: index + 1, total: sourceIds.length })
        if (index < sourceIds.length - 1) {
          await sleep(METADATA_GENERATION_DELAY_MS)
        }
      }
      setMetadataProgress(null)
    },
    [items, projectId, setItem],
  )

  // Regenera un item puntual con feedback tras revisar el resultado del wizard — reenvía el mismo sourceId, el backend encadena sobre la última revisión.
  const regenerateMetadata = useCallback(
    async (sourceId: string, feedback: string) => {
      const item = items[sourceId]
      if (!item || !hasRequiredSubtitles(item)) {
        setItem(sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Metadata, code: 'MISSING_SUBTITLES' } })
        return
      }

      setItem(sourceId, { state: 'generating', error: null })
      const result = await publishingUseCase.generateMetadata(projectId, {
        sourceId,
        feedback,
        context: item.context,
      })
      if (!result.ok) {
        setItem(sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Metadata, code: result.error.code } })
        return
      }
      setItem(sourceId, { state: 'ready', revision: result.value, error: null })
    },
    [items, projectId, setItem],
  )

  /**
   * Publica la selección a una o varias plataformas en un solo plan (el
   * contrato nuevo acepta `platforms: PublishingPlatform[]` — un mismo archivo
   * se sube una sola vez aunque vaya a YouTube y TikTok a la vez). Flujo:
   * 1) exportar cada item, guardando el blob en IndexedDB (no en memoria —
   *    ver publishBlobStorage) y reteniendo solo su tamaño; 2) declarar el
   *    plan (POST JSON, sin archivos); 3) subir cada archivo por TUS con
   *    progreso real, con concurrencia limitada (MAX_CONCURRENT_UPLOADS),
   *    leyendo su blob de IndexedDB justo antes de subirlo y borrándolo
   *    apenas termina. En ningún momento hay más de un puñado de blobs
   *    "vivos" en memoria JS a la vez, sin importar cuántos items tenga el
   *    bulk — clave para que esto no agote la RAM en equipos modestos.
   * El resultado final NO llega en la respuesta — se marca 'awaiting_result'
   * tras terminar de subir y se espera la notificación correspondiente
   * (fuera del alcance de este hook).
   */
  const publish = useCallback(
    async (sourceIds: string[], platforms: PublishingPlatform[], manualLongVideoUrl?: string) => {
      setPublishError(null)
      if (platforms.length === 0) return
      const selected = sourceIds.map((id) => items[id]).filter((item): item is PublishSeriesItem => !!item)
      if (selected.length === 0) return
      if (!selected.every(hasRevision)) {
        setPublishError('Todos los videos seleccionados necesitan metadata generada antes de publicar.')
        return
      }

      setIsPublishing(true)
      const videoMetaBySourceId: Record<string, { fileName: string; size: number }> = {}
      for (const item of selected) {
        setItem(item.sourceId, { state: 'exporting', uploadProgress: null, requestedPlatforms: platforms })
        const options = exportOptionsFor(item)
        const range = item.videoType === 'short' ? item.range : undefined
        const cropOffsetX = item.videoType === 'short' ? item.cropOffsetX : undefined
        const exportResult = await exportProjectToBlob(projectId, projectName, options, range, cropOffsetX)
        if (!exportResult.ok) {
          setItem(item.sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Export, failure: exportResult.error } })
          setIsPublishing(false)
          return
        }
        const fileName = `${item.sourceId}.${fileExtensionFor(options.format)}`
        // Se guarda en IndexedDB (disco) de una, y la referencia al Blob exportado sale de scope acá
        // — nada la retiene en memoria JS entre esta fase y la de subida más abajo.
        await publishBlobStorage.save(item.sourceId, exportResult.blob, fileName)
        videoMetaBySourceId[item.sourceId] = { fileName, size: exportResult.blob.size }
        // 'exported': este item ya tiene su blob listo, pero la exportación de la serie es
        // secuencial — si quedan otros por exportar, no puede arrancar a subir todavía solo.
        setItem(item.sourceId, { state: 'exported', uploadProgress: null })
      }

      // El video largo de esta serie es siempre items[projectId] (ver sourceId del longItem en PublishingPage) —
      // todos los shorts de un proyecto se recortan de ese mismo largo, no hay un largo distinto por short.
      const longVideoInSameBatch = selected.some((item) => item.videoType === 'long')
      const longVideoResultsByPlatform = items[projectId]?.resultsByPlatform
      // Busca la URL ya conocida del largo en CUALQUIERA de las plataformas de este plan (no solo
      // una fija) — si el largo ya se publicó antes en YouTube y ahora se publican shorts a YouTube
      // y TikTok a la vez, esa URL sirve igual para el link "Mirá el video completo" de ambos.
      const persistedLongVideoUrl = platforms.map((platform) => longVideoResultsByPlatform?.[platform]?.videoUrl).find((url) => !!url) ?? null
      // Si no hay URL persistida de una publicación previa a alguna de estas plataformas, se usa la
      // que el usuario haya ingresado a mano (ej. el largo está publicado en otra plataforma/sitio).
      const longVideoKnownUrl = persistedLongVideoUrl ?? manualLongVideoUrl?.trim() ?? null

      const planItems = selected.map((item) =>
        toPublishItemPlan(item, videoMetaBySourceId[item.sourceId].size, longVideoInSameBatch, longVideoKnownUrl, platforms),
      )
      // Reenviar el mismo seriesId/items siempre funciona, sea la primera vez o para resumir un
      // bulk ya activo (ej. la pestaña se cerró a mitad de subida) — el backend es la única fuente
      // de verdad de qué falta, no hace falta que el frontend guarde ni adivine nada (ver
      // BulkUploadPlanUpload.uploadUrl: null = ese archivo ya terminó de subir).
      const planResult = await publishingUseCase.planBulkUpload({
        seriesId: projectId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        longVideoPublishDay,
        platforms,
        items: planItems,
      })

      if (!planResult.ok) {
        await Promise.all(selected.map((item) => publishBlobStorage.remove(item.sourceId)))
        if (planResult.error.code === 'NO_PLATFORM_CONNECTION' || planResult.error.code === 'PLATFORM_TOKEN_EXPIRED') {
          setIsPublishing(false)
          await startPlatformOAuth(platforms[0], `/projects/${projectId}/publish`)
          return
        }
        setPublishError(PUBLISHING_ERROR_MESSAGES[planResult.error.code])
        for (const item of selected) {
          setItem(item.sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Request, code: planResult.error.code } })
        }
        setIsPublishing(false)
        return
      }

      // Un sourceId que NO viene en la respuesta = no aplica a ninguna plataforma de este plan (ej.
      // 'long' en un plan solo TikTok, que nunca sube el video largo) = 'skipped'.
      const uploadBySourceId = Object.fromEntries(planResult.value.uploads.map((upload) => [upload.sourceId, upload]))

      // uploadedPlatforms (antes alreadyPublishedPlatforms) ya NO implica un resultado de
      // publicación — solo dice "el archivo ya está subido para esas plataformas, no hace falta
      // volver a mandar el binario". El resultado real (uploaded/scheduled/inbox/failed) sigue sin
      // resolver y llega por notificación SSE como cualquier otro, por eso nunca se llama acá
      // applyNotificationResult con un status inventado. Si uploadedPlatforms cubre TODAS las
      // plataformas pedidas en este plan, el item queda sin nada que subir — directo a
      // awaiting_result sin pasar por 'uploading', esperando igual la notificación real.
      const pendingSourceIds: string[] = []
      for (const item of selected) {
        const upload = uploadBySourceId[item.sourceId]
        if (!upload) {
          setItem(item.sourceId, { state: 'skipped', uploadProgress: null })
          await publishBlobStorage.remove(item.sourceId)
          continue
        }
        const nothingLeftToUpload = platforms.every((platform) => upload.uploadedPlatforms.includes(platform))
        if (nothingLeftToUpload) {
          setItem(item.sourceId, { state: 'awaiting_result', uploadProgress: 100 })
          await publishBlobStorage.remove(item.sourceId)
          continue
        }
        setItem(item.sourceId, { state: 'uploading', uploadProgress: 0, error: null })
        pendingSourceIds.push(item.sourceId)
      }

      // Sube con concurrencia acotada (MAX_CONCURRENT_UPLOADS): cada "carril" toma el siguiente
      // sourceId pendiente, lee SU blob de IndexedDB recién en ese momento, lo sube, y lo borra de
      // IndexedDB apenas termina (éxito o fallo) — nunca hay más blobs leídos en memoria a la vez
      // que carriles configurados, sin importar cuántos items tenga el bulk completo.
      let nextIndex = 0
      const uploadNext = async (): Promise<void> => {
        const index = nextIndex
        nextIndex += 1
        if (index >= pendingSourceIds.length) return
        const sourceId = pendingSourceIds[index]
        const uploadUrl = uploadBySourceId[sourceId].uploadUrl

        if (!uploadUrl) {
          // Ya terminó de subir en un intento anterior — nada que hacer, directo a esperar el
          // resultado (igual que un upload recién terminado ahora mismo).
          setItem(sourceId, { state: 'awaiting_result', uploadProgress: 100 })
          await publishBlobStorage.remove(sourceId)
          return uploadNext()
        }

        const blobResult = await publishBlobStorage.get(sourceId)
        if (!blobResult.ok || !blobResult.value) {
          setItem(sourceId, {
            state: 'failed',
            uploadProgress: null,
            error: { kind: PublishItemFailureKind.Upload, error: { kind: 'TusUploadError', message: 'No se encontró el video exportado.' } },
          })
          return uploadNext()
        }

        const uploadResult = await publishingUseCase.uploadFile(
          uploadUrl,
          blobResult.value.blob,
          blobResult.value.fileName,
          (bytesUploaded, bytesTotal) => {
            const progress = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0
            setItem(sourceId, { uploadProgress: progress })
          },
        )
        await publishBlobStorage.remove(sourceId)
        if (!uploadResult.ok) {
          setItem(sourceId, {
            state: 'failed',
            uploadProgress: null,
            error: { kind: PublishItemFailureKind.Upload, error: uploadResult.error },
          })
          return uploadNext()
        }
        // No hay resultado final en este punto del flujo nuevo — el backend dispara la
        // publicación automáticamente cuando TODOS los archivos del bulk terminan, y el
        // resultado llega por notificación (fuera del alcance de este hook).
        setItem(sourceId, { state: 'awaiting_result', uploadProgress: 100 })
        return uploadNext()
      }

      const laneCount = Math.min(MAX_CONCURRENT_UPLOADS, pendingSourceIds.length)
      await Promise.all(Array.from({ length: laneCount }, () => uploadNext()))

      setIsPublishing(false)
    },
    [items, projectId, projectName, longVideoPublishDay, exportProjectToBlob, setItem],
  )

  /** Cancela explícitamente el bulk activo de la serie — el usuario decide "no, empezar de nuevo" en vez de continuar un bulk a medias. Deja el seriesId libre para que la próxima llamada a publish() declare un plan completamente nuevo. */
  const cancelActiveUpload = useCallback(async (): Promise<void> => {
    await publishingUseCase.cancelBulkUpload(projectId)
  }, [projectId])

  return {
    items,
    initItems,
    applyNotificationResult,
    setLongVideoPublishDay,
    longVideoPublishDay,
    generateAllMetadata,
    regenerateMetadata,
    metadataProgress,
    publish,
    cancelActiveUpload,
    isPublishing,
    publishError,
  }
}
