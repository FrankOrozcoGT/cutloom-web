import type { Notification } from '@domain/notification'
import { mapNotification } from './mappers'

const BASE_URL = import.meta.env.VITE_API_URL as string

/**
 * Auth por cookie httpOnly 'sseAccessToken' (seteada por el backend en
 * login/register/googleCallback/refresh) vía withCredentials — EventSource no
 * puede enviar el header Authorization, así que no depende del access token
 * en memoria del HttpClient. El navegador reconecta solo (reintento nativo
 * del EventSource, no hace falta reimplementarlo) y el backend manda
 * heartbeat cada 25s — pero un fallo de transporte persistente (ej. QUIC roto
 * contra un túnel/proxy) puede dejar la conexión intentando para siempre sin
 * que nada lo note: onStatusChange existe para que la UI pueda mostrar
 * "sin conexión en tiempo real" en vez de fallar en silencio mientras el
 * usuario espera notificaciones que nunca van a llegar por este canal.
 */
export class NotificationsStreamAdapter {
  subscribe(onNotification: (notification: Notification) => void, onStatusChange?: (connected: boolean) => void): () => void {
    const source = new EventSource(`${BASE_URL}/api/notifications/stream`, { withCredentials: true })
    const listener = (event: MessageEvent<string>) => {
      const notification = mapNotification(JSON.parse(event.data))
      if (notification) onNotification(notification)
    }
    const handleOpen = () => onStatusChange?.(true)
    const handleError = () => {
      // readyState CONNECTING (0) acá significa que el navegador YA está reintentando solo — no es
      // un fallo terminal. CLOSED (2) sí lo es (ocurre si el server respondió algo que EventSource
      // interpreta como error fatal, ej. un 4xx/5xx en el handshake inicial). En ambos casos se
      // reporta "no conectado" — la UI no necesita distinguir reintento-en-curso de fallo-terminal,
      // en los dos casos las notificaciones no están llegando ahora mismo.
      onStatusChange?.(false)
      console.error('Conexión de notificaciones (SSE) caída, readyState:', source.readyState)
    }
    source.addEventListener('notification', listener)
    source.addEventListener('open', handleOpen)
    source.addEventListener('error', handleError)
    return () => {
      source.removeEventListener('notification', listener)
      source.removeEventListener('open', handleOpen)
      source.removeEventListener('error', handleError)
      source.close()
    }
  }
}
