import type { NotificationList } from '@domain/notification'
import type { Result } from '@application/result'
import type { NotificationsError } from './errors'

export interface NotificationsBackendPort {
  list(onlyUnread?: boolean): Promise<Result<NotificationList, NotificationsError>>
  markRead(id: string): Promise<Result<void, NotificationsError>>
  markAllRead(): Promise<Result<void, NotificationsError>>
}
