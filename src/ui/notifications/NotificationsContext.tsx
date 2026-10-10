import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Notification } from '@domain/notification'
import { isPublishingResultNotification } from '@domain/publishing'
import { useAuth } from '@ui/auth/useAuth'
import { publishingUseCase } from '@ui/publishing/composition'
import { notificationsUseCase, notificationsStream } from './composition'
import { NotificationsContext, type NotificationsContextValue } from './notificationsContext'

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null)
  // true por default (optimista) hasta el primer evento real — evita parpadear "desconectado" en el
  // instante entre montar el provider y que el EventSource abra la conexión, que es el caso normal.
  const [isStreamConnected, setIsStreamConnected] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    const result = await notificationsUseCase.list()
    if (result.ok) {
      setNotifications(result.value.notifications)
      setUnreadCount(result.value.unreadCount)
    }
    setIsLoading(false)
  }, [])

  const markRead = useCallback(async (id: string) => {
    const result = await notificationsUseCase.markRead(id)
    if (!result.ok) return
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    const result = await notificationsUseCase.markAllRead()
    if (!result.ok) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    void load()
  }, [isAuthenticated, load])

  // Una sola instancia de EventSource por sesión, vive en el provider (no en
  // la campanita) para no abrir/cerrar conexiones al montar/desmontar UI.
  // Se cierra al desloguear para evitar una conexión zombi.
  useEffect(() => {
    if (!isAuthenticated) return
    setIsStreamConnected(true)
    const unsubscribe = notificationsStream.subscribe(
      (notification) => {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notification.id)) return prev
          return [notification, ...prev]
        })
        setUnreadCount((prev) => prev + 1)
        setLatestNotification(notification)
        if (isPublishingResultNotification(notification)) {
          void publishingUseCase.recordNotificationResult(notification)
        }
      },
      (connected) => setIsStreamConnected(connected),
    )
    return unsubscribe
  }, [isAuthenticated])

  const value: NotificationsContextValue = {
    notifications,
    unreadCount,
    isLoading,
    latestNotification,
    isStreamConnected,
    load,
    markRead,
    markAllRead,
  }

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
