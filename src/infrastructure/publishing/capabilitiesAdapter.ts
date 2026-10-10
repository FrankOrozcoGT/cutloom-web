import { z } from 'zod'
import type { PublishingCapabilities, PublishingPlatform } from '@domain/platform'
import { err, ok, type Result } from '@application/result'
import { PublishingError } from '@application/publishing/errors'
import type { HttpClient } from '@infrastructure/http/client'
import { parseErrorBody, parseJson } from '@infrastructure/http/parseJson'
import { mapPublishingError } from './mappers'

const capabilitiesResponseSchema = z.object({
  apiAvailable: z.boolean(),
  connected: z.boolean(),
})

export interface PublishingCapabilitiesPort {
  getCapabilities(platform: PublishingPlatform): Promise<Result<PublishingCapabilities, PublishingError>>
}

export class PublishingCapabilitiesAdapter implements PublishingCapabilitiesPort {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async getCapabilities(platform: PublishingPlatform): Promise<Result<PublishingCapabilities, PublishingError>> {
    const response = await this.http.get(`/api/publishing/${platform}/capabilities`)
    if (!response.ok) {
      const body = await parseErrorBody(response)
      // MISSING_ORGANIZATION no es un error fatal: significa "no viable ahora" (sin organización activa aún).
      if (body?.error === 'MISSING_ORGANIZATION') {
        return ok({ apiAvailable: false, connected: false })
      }
      return err(mapPublishingError(body?.error ?? 'UNKNOWN_ERROR', body?.message))
    }
    const body = await parseJson(response, capabilitiesResponseSchema)
    return ok({ apiAvailable: body.apiAvailable, connected: body.connected })
  }
}
