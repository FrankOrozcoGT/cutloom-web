import { AuthUseCase } from '@application/auth/AuthUseCase'
import { AuthApiAdapter } from '@infrastructure/auth/adapter'
import { httpClient } from '@infrastructure/http/client'

export { httpClient }
export const authUseCase = new AuthUseCase(new AuthApiAdapter(httpClient), httpClient)
