export type NotificationsErrorCode = 'NETWORK_ERROR' | 'UNKNOWN_ERROR'

export class NotificationsError extends Error {
  readonly code: NotificationsErrorCode

  constructor(code: NotificationsErrorCode, message: string) {
    super(message)
    this.name = 'NotificationsError'
    this.code = code
  }
}
