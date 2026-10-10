import { z } from 'zod'
import type { Notification, NotificationList } from '@domain/notification'

const platformSchema = z.union([z.literal('youtube'), z.literal('tiktok')])

const tikTokDraftReadyDataSchema = z.object({
  sourceId: z.string(),
  seriesId: z.string(),
  tikTokInboxUrl: z.string(),
})

const videoPublishedDataSchema = z.object({
  sourceId: z.string(),
  seriesId: z.string(),
  platform: platformSchema,
  videoUrl: z.string().nullable(),
})

const videoUploadFailedDataSchema = z.object({
  sourceId: z.string(),
  seriesId: z.string(),
  platform: platformSchema,
  failReason: z.string().nullable(),
})

const notificationSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string(), read: z.boolean(), createdAt: z.string(), type: z.literal('tiktok_draft_ready'), data: tikTokDraftReadyDataSchema }),
  z.object({ id: z.string(), read: z.boolean(), createdAt: z.string(), type: z.literal('video_published'), data: videoPublishedDataSchema }),
  z.object({ id: z.string(), read: z.boolean(), createdAt: z.string(), type: z.literal('video_upload_failed'), data: videoUploadFailedDataSchema }),
])

export const notificationListResponseSchema = z.object({
  notifications: z.array(z.unknown()),
  unreadCount: z.number(),
})
export type NotificationListResponseDto = z.infer<typeof notificationListResponseSchema>

/** Un tipo de notificación desconocido (agregado por el backend después de esta versión del frontend) se descarta en vez de crashear — forward-compat. */
export function mapNotification(raw: unknown): Notification | null {
  const result = notificationSchema.safeParse(raw)
  return result.success ? result.data : null
}

export function mapNotificationList(dto: NotificationListResponseDto): NotificationList {
  const notifications = dto.notifications.map(mapNotification).filter((n): n is Notification => n !== null)
  return { notifications, unreadCount: dto.unreadCount }
}
