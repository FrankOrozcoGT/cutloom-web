import { z } from 'zod'
import type { AuthErrorCode, AuthSession, CurrentUser, User, UserEntitlement } from '@domain/auth'
import { AuthError } from '@application/auth/errors'
import { mapKnownError } from '@infrastructure/errors'

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  authType: z.enum(['local', 'google']),
  createdAt: z.string(),
})

export const authSessionSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  isNewUser: z.boolean(),
})
export type AuthSessionDto = z.infer<typeof authSessionSchema>

const userEntitlementSchema = z.object({
  feature: z.string(),
  active: z.boolean(),
  usageLimit: z.number().nullable(),
  usageCount: z.number(),
})

export const currentUserSchema = z.object({
  user: userSchema,
  organizationId: z.string().nullable(),
  entitlements: z.array(userEntitlementSchema),
  youtubeConnected: z.boolean(),
  youtubeGoogleEmail: z.string().nullable(),
  youtubeChannelTitle: z.string().nullable(),
})
export type CurrentUserDto = z.infer<typeof currentUserSchema>

export function mapUser(dto: z.infer<typeof userSchema>): User {
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

export function mapUserEntitlement(dto: z.infer<typeof userEntitlementSchema>): UserEntitlement {
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
    youtubeGoogleEmail: dto.youtubeGoogleEmail,
    youtubeChannelTitle: dto.youtubeChannelTitle,
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
