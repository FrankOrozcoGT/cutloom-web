import { useState } from 'react'
import { ErrorBanner } from '@ui/components/ErrorBanner'
import { Button } from '@ui/components/Button'
import { CollapsibleSection } from '@ui/components/CollapsibleSection'
import { PUBLISHING_ERROR_MESSAGES } from '@ui/publishing/errorMessages'
import { exportErrorCodeMessage, ExportFailureKind } from '@ui/hooks/useExport'
import { PublishItemErrorKind } from '@domain/publishing'
import {
  PublishItemFailureKind,
  type PublishItemFailure,
  type PublishItemState,
  type PublishSeriesItem,
} from '@ui/hooks/usePublishYouTube'

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
    case PublishItemFailureKind.Upload:
      switch (failure.error.kind) {
        case PublishItemErrorKind.QuotaExceeded:
          return 'Se alcanzó la cuota de subida de YouTube. Podés exportar y subir este video manualmente más tarde.'
        case PublishItemErrorKind.TokenExpired:
          return 'La sesión de YouTube expiró. Reconectá tu cuenta para continuar.'
        case PublishItemErrorKind.Freeform:
          return failure.error.message
      }
  }
}

function statusLabel(item: PublishSeriesItem): string {
  switch (item.state) {
    case 'idle':
      return 'Sin metadata'
    case 'generating':
      return 'Generando metadata…'
    case 'ready':
      return 'Listo para publicar'
    case 'exporting':
      return 'Exportando video…'
    case 'uploading':
      return 'Subiendo a YouTube…'
    case 'uploaded':
      return 'Publicado'
    case 'scheduled':
      return 'Programado'
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
  uploading: 'border-warning',
  uploaded: 'border-success',
  scheduled: 'border-success',
  failed: 'border-danger',
  unknown: 'border-warning',
}

const STATE_BADGE_CLASSES: Record<PublishItemState, string> = {
  idle: 'bg-surface text-text-muted',
  generating: 'bg-warning-bg text-warning',
  ready: 'bg-success-bg text-success',
  exporting: 'bg-warning-bg text-warning',
  uploading: 'bg-warning-bg text-warning',
  uploaded: 'bg-success-bg text-success',
  scheduled: 'bg-success-bg text-success',
  failed: 'bg-danger-bg text-danger',
  unknown: 'bg-warning-bg text-warning',
}

export function PublishItemCard({ item, title, onRegenerate }: PublishItemCardProps) {
  const [feedback, setFeedback] = useState('')
  const busy = item.state === 'generating' || item.state === 'exporting' || item.state === 'uploading'

  return (
    <div className={`rounded-lg border-2 ${STATE_BORDER_CLASSES[item.state]}`}>
      <CollapsibleSection
        title={`${title} — ${item.videoType === 'short' ? `Short · score ${item.score.toFixed(2)}` : 'Video largo'}`}
        badge={statusLabel(item)}
        badgeClassName={STATE_BADGE_CLASSES[item.state]}
      >
        {item.error && (
          <ErrorBanner variant={item.state === 'failed' ? 'danger' : 'warning'}>{failureMessage(item.error)}</ErrorBanner>
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

        {item.result?.url && (
          <a href={item.result.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent hover:underline">
            Ver en YouTube
          </a>
        )}
      </CollapsibleSection>
    </div>
  )
}
