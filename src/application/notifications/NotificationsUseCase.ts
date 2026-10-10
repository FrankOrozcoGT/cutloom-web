import type { NotificationList } from '@domain/notification'
import type { Result } from '@application/result'
import type { NotificationsError } from './errors'
import type { NotificationsBackendPort } from './ports'

export class NotificationsUseCase {
  private readonly api: NotificationsBackendPort

  constructor(api: NotificationsBackendPort) {
    this.api = api
  }

  async list(onlyUnread?: boolean): Promise<Result<NotificationList, NotificationsError>> {
    return this.api.list(onlyUnread)
  }

  async markRead(id: string): Promise<Result<void, NotificationsError>> {
    return this.api.markRead(id)
  }

  async markAllRead(): Promise<Result<void, NotificationsError>> {
    return this.api.markAllRead()
  }
}
