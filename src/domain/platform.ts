export type PublishingPlatform = 'youtube' | 'tiktok'

export const PUBLISHING_PLATFORMS: readonly PublishingPlatform[] = ['youtube', 'tiktok']

export function platformLabel(platform: PublishingPlatform): string {
  return platform === 'youtube' ? 'YouTube' : 'TikTok'
}

export interface PublishingCapabilities {
  apiAvailable: boolean
  connected: boolean
}

export function isPublishableViaApi(capabilities: PublishingCapabilities): boolean {
  return capabilities.apiAvailable && capabilities.connected
}

export function platformVideoUrl(platform: PublishingPlatform, platformVideoId: string | null): string | null {
  if (!platformVideoId) return null
  if (platform === 'youtube') return `https://www.youtube.com/watch?v=${platformVideoId}`
  return null
}
