import type { AuthErrorCode, AuthSession, CurrentUser, User, UserEntitlement } from '@domain/auth'
import { AuthError } from '@application/auth/errors'
import { mapKnownError } from '@infrastructure/errors'

interface UserDto {
  id: string
  email: string
  name: string
  authType: 'local' | 'google'
  createdAt: string
}

export interface AuthSessionDto {
  user: UserDto
  accessToken: string
  isNewUser: boolean
}

interface UserEntitlementDto {
  feature: string
  active: boolean
  usageLimit: number | null
  usageCount: number
}

export interface CurrentUserDto {
  user: UserDto
  organizationId: string | null
  entitlements: UserEntitlementDto[]
  youtubeConnected: boolean
}

export function mapUser(dto: UserDto): User {
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    authType: dto.authType,
    createdAt: dto.createdAt,
  }
}

export function mapAuthSession(dto: AuthSessionDto): AuthSession {
  return {
    user: mapUser(dto.user),
    accessToken: dto.accessToken,
    isNewUser: dto.isNewUser,
  }
}

export function mapUserEntitlement(dto: UserEntitlementDto): UserEntitlement {
  return {
    feature: dto.feature,
    active: dto.active,
    usageLimit: dto.usageLimit,
    usageCount: dto.usageCount,
  }
}

export function mapCurrentUser(dto: CurrentUserDto): CurrentUser {
  return {
    user: mapUser(dto.user),
    organizationId: dto.organizationId,
    entitlements: dto.entitlements.map(mapUserEntitlement),
    youtubeConnected: dto.youtubeConnected,
  }
}

const KNOWN_ERROR_CODES: readonly AuthErrorCode[] = [
  'EMAIL_EXISTS',
  'EMAIL_EXISTS_GOOGLE',
  'EMAIL_EXISTS_LOCAL',
  'INVALID_CREDENTIALS',
  'WEAK_PASSWORD',
  'INVALID_TOKEN',
  'MISSING_ACCESS_TOKEN',
  'INVALID_EMAIL',
  'GOOGLE_AUTH_FAILED',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
]

export function mapAuthError(code: string, message?: string): AuthError {
  return mapKnownError(KNOWN_ERROR_CODES, (c, m) => new AuthError(c, m), code, message)
}
