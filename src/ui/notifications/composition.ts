import { NotificationsUseCase } from '@application/notifications/NotificationsUseCase'
import { NotificationsApiAdapter } from '@infrastructure/notifications/adapter'
import { NotificationsStreamAdapter } from '@infrastructure/notifications/sseAdapter'
import { httpClient } from '@infrastructure/http/client'

export const notificationsApi = new NotificationsApiAdapter(httpClient)
export const notificationsUseCase = new NotificationsUseCase(notificationsApi)
export const notificationsStream = new NotificationsStreamAdapter()
