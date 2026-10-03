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
  /** Unidades restantes del plan en este ciclo de facturación, para esta feature. null = sin tope (acceso ilimitado). Se recarga en cada renovación/cambio de plan. */
  planBalance: number | null
}

export interface CurrentUser {
  user: User
  organizationId: string | null
  entitlements: UserEntitlement[]
  /** Unidades de crédito comprado, libres, sin asociar a ninguna feature — se consumen cuando planBalance de una feature llega a 0. No es dinero, son las mismas unidades que planBalance (hoy: minutos). */
  creditBalance: number
  youtubeConnected: boolean
  /** null aunque youtubeConnected sea true si la conexión se hizo con el scope viejo (antes de pedir email/canal) — hace falta reconectar para que aparezca. */
  youtubeGoogleEmail: string | null
  /** Mismo caso de null que youtubeGoogleEmail. */
  youtubeChannelTitle: string | null
  tiktokConnected: boolean
  /** null aunque tiktokConnected sea true si la conexión se hizo con el token viejo — no bloquear por eso. */
  tiktokDisplayName: string | null
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
