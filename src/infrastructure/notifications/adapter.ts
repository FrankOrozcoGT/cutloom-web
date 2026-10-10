import type { NotificationList } from '@domain/notification'
import type { NotificationsBackendPort } from '@application/notifications/ports'
import { NotificationsError } from '@application/notifications/errors'
import { err, ok, type Result } from '@application/result'
import type { HttpClient } from '@infrastructure/http/client'
import { parseJson } from '@infrastructure/http/parseJson'
import { mapNotificationList, notificationListResponseSchema } from './mappers'

export class NotificationsApiAdapter implements NotificationsBackendPort {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async list(onlyUnread?: boolean): Promise<Result<NotificationList, NotificationsError>> {
    const query = onlyUnread ? '?onlyUnread=true' : ''
    const response = await this.http.get(`/api/notifications${query}`)
    if (!response.ok) {
      return err(new NotificationsError('UNKNOWN_ERROR', 'No se pudieron obtener las notificaciones.'))
    }
    const body = await parseJson(response, notificationListResponseSchema)
    return ok(mapNotificationList(body))
  }

  async markRead(id: string): Promise<Result<void, NotificationsError>> {
    const response = await this.http.post(`/api/notifications/${id}/read`)
    if (!response.ok) {
      return err(new NotificationsError('UNKNOWN_ERROR', 'No se pudo marcar la notificación como leída.'))
    }
    return ok(undefined)
  }

  async markAllRead(): Promise<Result<void, NotificationsError>> {
    const response = await this.http.post('/api/notifications/all/read')
    if (!response.ok) {
      return err(new NotificationsError('UNKNOWN_ERROR', 'No se pudieron marcar las notificaciones como leídas.'))
    }
    return ok(undefined)
  }
}
