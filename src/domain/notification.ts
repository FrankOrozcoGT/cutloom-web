import type { PublishingPlatform } from './platform'

// video_published/video_upload_failed generalizan los tipos que antes eran
// específicos de TikTok (tiktok_published/tiktok_upload_failed) — ahora cubren
// YouTube y TikTok por igual, con platform como campo discriminante propio
// dentro de data. tiktok_draft_ready sigue siendo exclusivo de TikTok (borrador
// en la bandeja, no hay equivalente en YouTube).
export type NotificationType = 'tiktok_draft_ready' | 'video_published' | 'video_upload_failed'

export interface TikTokDraftReadyData {
  sourceId: string
  seriesId: string
  tikTokInboxUrl: string
}

export interface VideoPublishedData {
  sourceId: string
  seriesId: string
  platform: PublishingPlatform
  videoUrl: string | null
}

export interface VideoUploadFailedData {
  sourceId: string
  seriesId: string
  platform: PublishingPlatform
  failReason: string | null
}

interface NotificationBase {
  id: string
  read: boolean
  createdAt: string
}

export type Notification =
  | (NotificationBase & { type: 'tiktok_draft_ready'; data: TikTokDraftReadyData })
  | (NotificationBase & { type: 'video_published'; data: VideoPublishedData })
  | (NotificationBase & { type: 'video_upload_failed'; data: VideoUploadFailedData })

export interface NotificationList {
  notifications: Notification[]
  unreadCount: number
}
