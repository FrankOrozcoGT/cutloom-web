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
