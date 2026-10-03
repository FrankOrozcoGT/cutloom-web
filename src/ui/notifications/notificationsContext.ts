import { createContext } from 'react'
import type { Notification } from '@domain/notification'

export interface NotificationsContextValue {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  load: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null)
