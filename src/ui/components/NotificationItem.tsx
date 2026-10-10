import type { Notification } from '@domain/notification'
import { platformLabel } from '@domain/platform'

interface NotificationItemProps {
  notification: Notification
  onRead: (id: string) => void
}

function messageFor(notification: Notification): { text: string; href: string | null } {
  switch (notification.type) {
    case 'tiktok_draft_ready':
      return { text: 'Tu video quedó como borrador en TikTok Studio.', href: notification.data.tikTokInboxUrl }
    case 'video_published':
      return { text: `Tu video se publicó en ${platformLabel(notification.data.platform)}.`, href: notification.data.videoUrl }
    case 'video_upload_failed': {
      const platform = platformLabel(notification.data.platform)
      return {
        text: notification.data.failReason ? `Falló la subida a ${platform}: ${notification.data.failReason}` : `Falló la subida a ${platform}.`,
        href: null,
      }
    }
  }
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const { text, href } = messageFor(notification)

  return (
    <li
      className={`flex flex-col gap-1 border-b border-border px-3 py-2 text-sm last:border-b-0 ${notification.read ? 'text-text-muted' : 'text-text-strong'}`}
    >
      <p>{text}</p>
      <div className="flex items-center gap-3 text-xs">
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            Ver
          </a>
        )}
        {!notification.read && (
          <button type="button" className="text-text-muted hover:text-text-strong hover:underline" onClick={() => onRead(notification.id)}>
            Marcar como leída
          </button>
        )}
      </div>
    </li>
  )
}
