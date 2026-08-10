import type { AuthErrorCode, AuthSession, User } from '@domain/auth'
import { AuthError } from '@application/auth/errors'

interface UserDto {
  id: string
  email: string
  name: string
  authType: 'local' | 'google'
  createdAt: string
}

interface AuthSessionDto {
  user: UserDto
  accessToken: string
  isNewUser: boolean
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

const KNOWN_ERROR_CODES = new Set<AuthErrorCode>([
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
])

export function mapAuthError(code: string, message?: string): AuthError {
  const resolvedCode: AuthErrorCode = KNOWN_ERROR_CODES.has(code as AuthErrorCode)
    ? (code as AuthErrorCode)
    : 'UNKNOWN_ERROR'
  return new AuthError(resolvedCode, message ?? resolvedCode)
}
