import { useCallback, useState } from 'react'
import {
  PublishItemErrorKind,
  type BulkUploadVideo,
  type MetadataContext,
  type MetadataRevision,
  type PublishedSourceRecord,
  type PublishItem,
  type PublishItemError,
  type PublishItemResult,
} from '@domain/publishing'
import type { PublishingErrorCode } from '@application/publishing/errors'
import { PUBLISHING_ERROR_MESSAGES } from '@ui/publishing/errorMessages'
import { publishingUseCase } from '@ui/publishing/composition'
import { startYouTubeOAuth } from '@ui/publishing/oauth'
import { useExport, type ExportFailure } from '@ui/hooks/useExport'
import {
  DEFAULT_EXPORT_OPTIONS,
  fileExtensionFor,
  SHORT_EXPORT_OPTIONS,
  type ExportOptions,
} from '@application/video/exportTypes'

export type PublishItemState = 'idle' | 'generating' | 'ready' | 'exporting' | 'uploading' | 'uploaded' | 'scheduled' | 'failed' | 'unknown'

export const PublishItemFailureKind = {
  Metadata: 'Metadata',
  Export: 'Export',
  Request: 'Request',
  Upload: 'Upload',
} as const

/**
 * Errores de un item de la serie vienen de cuatro orígenes distintos con
 * vocabularios propios (metadata IA, export de video, fallo del bulk-upload
 * a nivel request completo, resultado del bulk-upload por-item) — un solo
 * string plano perdía esa distinción y mostraba códigos técnicos crudos al
 * usuario. Cada variante trae su propio código tipado para que el consumidor
 * (PublishItemCard) elija el mensaje correcto.
 */
export type PublishItemFailure =
  | { kind: typeof PublishItemFailureKind.Metadata; code: PublishingErrorCode }
  | { kind: typeof PublishItemFailureKind.Export; failure: ExportFailure }
  | { kind: typeof PublishItemFailureKind.Request; code: PublishingErrorCode }
  | { kind: typeof PublishItemFailureKind.Upload; error: PublishItemError }

export interface PublishSeriesItemBase {
  sourceId: string
  context?: MetadataContext
  state: PublishItemState
  revision: MetadataRevision | null
  error: PublishItemFailure | null
  result: PublishItemResult | null
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

interface UsePublishYouTubeParams {
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

function toPublishItem(item: PublishSeriesItemWithRevision): PublishItem {
  if (item.videoType === 'long') {
    return { sourceId: item.sourceId, metadataRevisionId: item.revision.revisionId, videoType: 'long' }
  }
  return { sourceId: item.sourceId, metadataRevisionId: item.revision.revisionId, videoType: 'short', score: item.score }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function usePublishYouTube({ projectId, projectName }: UsePublishYouTubeParams) {
  const [items, setItems] = useState<Record<string, PublishSeriesItem>>({})
  const [longVideoPublishDay, setLongVideoPublishDay] = useState('')
  const [publishError, setPublishError] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  // Progreso del wizard de metadata: {done, total} mientras corre, null cuando no hay generación en curso.
  const [metadataProgress, setMetadataProgress] = useState<{ done: number; total: number } | null>(null)
  const { exportProjectToBlob } = useExport()

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

  // Aplica el registro persistido (metadata generada, resultado de un publish
  // previo) sobre cada item recién armado — sin esto, recargar la pantalla
  // pierde la metadata ya generada y no hay forma de saber si un source ya
  // se publicó antes.
  const initItems = useCallback((seriesItems: PublishSeriesItem[], persisted?: Record<string, PublishedSourceRecord>) => {
    const withPersisted = seriesItems.map((item) => {
      const record = persisted?.[item.sourceId]
      if (!record) return item
      const state: PublishItemState = record.result?.status ?? 'ready'
      // El spread sobre `item` (una unión discriminada) preserva su rama
      // concreta (PublishLongSeriesItem o PublishShortSeriesItem) porque
      // TypeScript infiere el tipo de retorno del literal, no de PublishSeriesItem —
      // no hace falta bifurcar por videoType para que el tipo quede bien inferido.
      return { ...item, revision: record.revision, result: record.result, state }
    })
    setItems(Object.fromEntries(withPersisted.map((item) => [item.sourceId, item])))
  }, [])

  // Genera metadata para todos los sourceIds en secuencia (no en paralelo) con
  // un delay entre llamadas — es un wizard de un solo paso para toda la serie,
  // no un botón por item: el usuario llena topic/tone/additionalInstructions
  // una sola vez y estos se reenvían igual para cada item, dejando que el
  // backend infiera lo que falte a partir del context propio de cada uno.
  // Cada resultado se persiste apenas llega (ver publishingStorage.upsertSource
  // más abajo) para sobrevivir a recargar PublishingPage.
  const generateAllMetadata = useCallback(
    async (sourceIds: string[], input: MetadataWizardInput) => {
      setMetadataProgress({ done: 0, total: sourceIds.length })
      for (let index = 0; index < sourceIds.length; index += 1) {
        const sourceId = sourceIds[index]
        const item = items[sourceId]
        if (!item) continue

        setItem(sourceId, { state: 'generating', error: null })
        const result = await publishingUseCase.generateMetadata(
          projectId,
          {
            sourceId,
            topic: input.topic.trim() || undefined,
            tone: input.tone.trim() || undefined,
            additionalInstructions: input.additionalInstructions.trim() || undefined,
            context: item.context,
          },
          item.result,
        )
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
      setItem(sourceId, { state: 'generating', error: null })
      const item = items[sourceId]
      const result = await publishingUseCase.generateMetadata(projectId, { sourceId, feedback, context: item?.context }, item?.result ?? null)
      if (!result.ok) {
        setItem(sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Metadata, code: result.error.code } })
        return
      }
      setItem(sourceId, { state: 'ready', revision: result.value, error: null })
    },
    [items, projectId, setItem],
  )

  const publish = useCallback(
    async (sourceIds: string[]) => {
      setPublishError(null)
      const selected = sourceIds.map((id) => items[id]).filter((item): item is PublishSeriesItem => !!item)
      if (selected.length === 0) return
      if (!selected.every(hasRevision)) {
        setPublishError('Todos los videos seleccionados necesitan metadata generada antes de publicar.')
        return
      }

      setIsPublishing(true)
      const videos: BulkUploadVideo[] = []
      for (const item of selected) {
        setItem(item.sourceId, { state: 'exporting' })
        const options = exportOptionsFor(item)
        const range = item.videoType === 'short' ? item.range : undefined
        const cropOffsetX = item.videoType === 'short' ? item.cropOffsetX : undefined
        const exportResult = await exportProjectToBlob(projectId, projectName, options, range, cropOffsetX)
        if (!exportResult.ok) {
          setItem(item.sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Export, failure: exportResult.error } })
          setIsPublishing(false)
          return
        }
        videos.push({
          sourceId: item.sourceId,
          blob: exportResult.blob,
          fileName: `${item.sourceId}.${fileExtensionFor(options.format)}`,
        })
      }

      for (const item of selected) {
        setItem(item.sourceId, { state: 'uploading' })
      }

      const publishItems = selected.map(toPublishItem)
      const result = await publishingUseCase.bulkUpload({
        seriesId: projectId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        longVideoPublishDay,
        items: publishItems,
        videos,
      })

      if (!result.ok) {
        if (result.error.code === 'NO_YOUTUBE_CONNECTION') {
          setIsPublishing(false)
          await startYouTubeOAuth(`/projects/${projectId}/publish`)
          return
        }
        setPublishError(PUBLISHING_ERROR_MESSAGES[result.error.code])
        for (const item of selected) {
          setItem(item.sourceId, { state: 'failed', error: { kind: PublishItemFailureKind.Request, code: result.error.code } })
        }
        setIsPublishing(false)
        return
      }

      let tokenExpired = false
      for (const itemResult of result.value.results) {
        if (itemResult.error?.kind === PublishItemErrorKind.TokenExpired) {
          tokenExpired = true
        }
        setItem(itemResult.sourceId, {
          state: itemResult.status,
          result: itemResult,
          error: itemResult.error ? { kind: PublishItemFailureKind.Upload, error: itemResult.error } : null,
        })
        const published = selected.find((item) => item.sourceId === itemResult.sourceId)
        if (published?.revision) {
          await publishingUseCase.recordUploadResult(projectId, itemResult.sourceId, published.revision, itemResult)
        }
      }

      setIsPublishing(false)
      if (tokenExpired) {
        await startYouTubeOAuth(`/projects/${projectId}/publish`)
      }
    },
    [items, projectId, projectName, longVideoPublishDay, exportProjectToBlob, setItem],
  )

  return {
    items,
    initItems,
    setLongVideoPublishDay,
    longVideoPublishDay,
    generateAllMetadata,
    regenerateMetadata,
    metadataProgress,
    publish,
    isPublishing,
    publishError,
  }
}
