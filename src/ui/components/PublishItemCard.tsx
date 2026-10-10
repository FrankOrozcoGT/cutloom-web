import { useState } from 'react'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { Button } from '@ui/components/Button'
import { CollapsibleSection } from '@ui/components/CollapsibleSection'
import { PUBLISHING_ERROR_MESSAGES } from '@ui/publishing/errorMessages'
import { exportErrorCodeMessage, ExportFailureKind } from '@ui/hooks/useExport'
import { platformLabel } from '@domain/platform'
import {
  PublishItemFailureKind,
  type PublishItemFailure,
  type PublishItemState,
  type PublishSeriesItem,
} from '@ui/hooks/usePublish'

interface PublishItemCardProps {
  item: PublishSeriesItem
  title: string
  onRegenerate: (feedback: string) => void
}

function failureMessage(failure: PublishItemFailure): string {
  switch (failure.kind) {
    case PublishItemFailureKind.Metadata:
    case PublishItemFailureKind.Request:
      return PUBLISHING_ERROR_MESSAGES[failure.code]
    case PublishItemFailureKind.Export:
      return failure.failure.kind === ExportFailureKind.Known
        ? exportErrorCodeMessage(failure.failure.code)
        : `Ocurrió un error inesperado durante la exportación: ${failure.failure.message}`
    // La subida ahora es por TUS (tus-js-client) en vez de fetch+FormData — el error ya no viene
    // clasificado por el backend (QuotaExceeded/TokenExpired), es el mensaje crudo de tus-js-client.
    case PublishItemFailureKind.Upload:
      return `No se pudo subir el archivo: ${failure.error.message}`
  }
}

/** Todas las plataformas con un resultado ya resuelto (no 'uploading'/'awaiting_result' local, sino un status real devuelto por el backend) — true también cuando no hay ninguna plataforma registrada todavía, así que SIEMPRE hay que chequear junto con Object.keys(...).length > 0 en el caller. */
function allResultsResolved(item: PublishSeriesItem): boolean {
  const results = Object.values(item.resultsByPlatform)
  return results.length > 0 && results.every((result) => result.status !== 'unknown')
}

/**
 * 'awaiting_result' es la fase de pipeline local ("ya subí, espero que el backend confirme") — si
 * para cuando se renderiza ya llegó el resultado real (vía notificación SSE, ver
 * applyNotificationResult en usePublish) para todas las plataformas pedidas, mostrar el resultado
 * real en vez del label genérico de "esperando". uploadedPlatforms (ver domain/publishing) NO
 * resuelve esto por sí solo — solo evita volver a subir el binario, el resultado de publicación
 * siempre llega por notificación. Reutilizado por statusLabel y por los mapas de color (badge/borde)
 * para que ambos coincidan.
 */
function effectiveState(item: PublishSeriesItem): PublishItemState {
  if (item.state === 'awaiting_result' && allResultsResolved(item)) {
    const results = Object.values(item.resultsByPlatform)
    return results.every((result) => result.status === 'uploaded' || result.status === 'scheduled') ? 'uploaded' : 'failed'
  }
  return item.state
}

function statusLabel(item: PublishSeriesItem): string {
  const state = effectiveState(item)
  if (state !== item.state) {
    return state === 'uploaded' ? 'Publicado' : 'Resuelto con errores'
  }
  switch (item.state) {
    case 'idle':
      return 'Sin metadata'
    case 'generating':
      return 'Generando metadata…'
    case 'ready':
      return 'Listo para publicar'
    case 'exporting':
      return 'Exportando video…'
    case 'exported':
      return 'Video listo — esperando a los demás para subir'
    case 'uploading':
      return item.uploadProgress !== null ? `Subiendo… ${item.uploadProgress}%` : 'Subiendo…'
    case 'awaiting_result':
      return 'Subida completa — esperando confirmación'
    case 'uploaded':
      return 'Publicado'
    case 'scheduled':
      return 'Programado'
    case 'inbox':
      return 'Borrador en la bandeja'
    case 'skipped':
      return 'No aplica a esta plataforma'
    case 'failed':
      return 'Falló'
    case 'unknown':
      return 'Estado desconocido'
  }
}

/** Color del borde/badge según el estado — verde cuando terminó bien, rojo si falló, ámbar mientras corre, para distinguir de un vistazo sin abrir cada card. */
const STATE_BORDER_CLASSES: Record<PublishItemState, string> = {
  idle: 'border-border',
  generating: 'border-warning',
  ready: 'border-success',
  exporting: 'border-warning',
  exported: 'border-warning',
  uploading: 'border-warning',
  awaiting_result: 'border-warning',
  uploaded: 'border-success',
  scheduled: 'border-success',
  inbox: 'border-warning',
  skipped: 'border-border',
  failed: 'border-danger',
  unknown: 'border-warning',
}

const STATE_BADGE_CLASSES: Record<PublishItemState, string> = {
  idle: 'bg-surface text-text-muted',
  generating: 'bg-warning-bg text-warning',
  ready: 'bg-success-bg text-success',
  exporting: 'bg-warning-bg text-warning',
  exported: 'bg-warning-bg text-warning',
  uploading: 'bg-warning-bg text-warning',
  awaiting_result: 'bg-warning-bg text-warning',
  uploaded: 'bg-success-bg text-success',
  scheduled: 'bg-success-bg text-success',
  inbox: 'bg-warning-bg text-warning',
  skipped: 'bg-surface text-text-muted',
  failed: 'bg-danger-bg text-danger',
  unknown: 'bg-warning-bg text-warning',
}

export function PublishItemCard({ item, title, onRegenerate }: PublishItemCardProps) {
  const [feedback, setFeedback] = useState('')
  const visualState = effectiveState(item)
  const busy =
    item.state === 'generating' ||
    item.state === 'exporting' ||
    item.state === 'exported' ||
    item.state === 'uploading' ||
    (item.state === 'awaiting_result' && visualState === item.state)

  return (
    <div className={`rounded-lg border-2 ${STATE_BORDER_CLASSES[visualState]}`}>
      <CollapsibleSection
        title={`${title} — ${item.videoType === 'short' ? `Short · score ${item.score.toFixed(2)}` : 'Video largo'}`}
        badge={statusLabel(item)}
        badgeClassName={STATE_BADGE_CLASSES[visualState]}
      >
        {item.error && (
          <ErrorBanner variant={item.state === 'failed' ? 'danger' : 'warning'}>{failureMessage(item.error)}</ErrorBanner>
        )}

        {item.state === 'uploading' && item.uploadProgress !== null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={item.uploadProgress} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{ width: `${item.uploadProgress}%` }}
            />
          </div>
        )}

        {item.revision && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium text-text-strong">{item.revision.metadata.title}</p>
            <p className="text-text-muted">{item.revision.metadata.description}</p>
            <p className="text-xs text-text-muted">{item.revision.metadata.tags.join(', ')}</p>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Feedback para regenerar (opcional)"
              className="mt-2 rounded-lg border border-border bg-bg p-2 text-sm"
              disabled={busy}
            />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onRegenerate(feedback)}>
              Regenerar con feedback
            </Button>
          </div>
        )}

        {Object.values(item.resultsByPlatform).map((result) => (
          <div key={result.platform} className="flex flex-col gap-1">
            {result.status === 'inbox' && (
              <ErrorBanner variant="warning">
                El video llegó como borrador a la bandeja de TikTok Studio — abrí la app de TikTok para confirmarlo.
              </ErrorBanner>
            )}
            {result.videoUrl && (
              <a
                href={result.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-accent hover:underline"
              >
                Ver en {platformLabel(result.platform)}
              </a>
            )}
          </div>
        ))}
      </CollapsibleSection>
    </div>
  )
}
