import { createContext } from 'react'
import type { Notification } from '@domain/notification'

export interface NotificationsContextValue {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  /** Última notificación recibida en vivo por el SSE (no las ya cargadas por `load`) — cambia de referencia en cada evento nuevo, incluso repetido, para que un `useEffect([latestNotification])` en otra pantalla (ej. PublishingPage) pueda reaccionar sin abrir una segunda conexión EventSource. */
  latestNotification: Notification | null
  /** false si la conexión SSE está caída (fallo de red persistente, ej. QUIC roto contra un túnel/proxy) — mientras esté así, los resultados finales de publicación NO van a llegar en vivo, aunque la subida en sí haya terminado bien. La UI debe avisar esto explícitamente en vez de dejar un item "esperando confirmación" sin explicación. */
  isStreamConnected: boolean
  load: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null)
