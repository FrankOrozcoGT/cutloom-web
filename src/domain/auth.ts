export type AuthType = 'local' | 'google'

export interface User {
  id: string
  email: string
  name: string
  authType: AuthType
  createdAt: string
}

export interface AuthSession {
  user: User
  accessToken: string
  isNewUser: boolean
}

export interface AuthCredentials {
  email: string
  password: string
}

export interface UserEntitlement {
  feature: string
  active: boolean
  usageLimit: number | null
  usageCount: number
}

export interface CurrentUser {
  user: User
  organizationId: string | null
  entitlements: UserEntitlement[]
  youtubeConnected: boolean
  /** null aunque youtubeConnected sea true si la conexión se hizo con el scope viejo (antes de pedir email/canal) — hace falta reconectar para que aparezca. */
  youtubeGoogleEmail: string | null
  /** Mismo caso de null que youtubeGoogleEmail. */
  youtubeChannelTitle: string | null
}

export type AuthErrorCode =
  | 'EMAIL_EXISTS'
  | 'EMAIL_EXISTS_GOOGLE'
  | 'EMAIL_EXISTS_LOCAL'
  | 'INVALID_CREDENTIALS'
  | 'WEAK_PASSWORD'
  | 'INVALID_TOKEN'
  | 'MISSING_ACCESS_TOKEN'
  | 'INVALID_EMAIL'
  | 'GOOGLE_AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'
