import { useContext } from 'react'
import { NotificationsContext, type NotificationsContextValue } from './notificationsContext'

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider')
  }
  return context
}
