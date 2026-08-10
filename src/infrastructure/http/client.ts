const BASE_URL = import.meta.env.VITE_API_URL as string

type RefreshResult = { accessToken: string } | null

export class HttpClient {
  private accessToken: string | null = null
  private refreshPromise: Promise<RefreshResult> | null = null
  private onSessionExpired: (() => void) | null = null

  setAccessToken(token: string | null): void {
    this.accessToken = token
  }

  getAccessToken(): string | null {
    return this.accessToken
  }

  setSessionExpiredHandler(handler: (() => void) | null): void {
    this.onSessionExpired = handler
  }

  async request(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.accessToken}`)
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    })

    if (response.status !== 401 || isRetry || path === '/api/auth/refresh') {
      return response
    }

    const refreshed = await this.refreshAccessToken()
    if (!refreshed) {
      this.accessToken = null
      this.onSessionExpired?.()
      return response
    }

    this.accessToken = refreshed.accessToken
    return this.request(path, init, true)
  }

  private async refreshAccessToken(): Promise<RefreshResult> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null
      })
    }
    return this.refreshPromise
  }

  private async doRefresh(): Promise<RefreshResult> {
    const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      return null
    }
    const body = (await response.json()) as { accessToken: string }
    return body
  }

  get(path: string, init: RequestInit = {}): Promise<Response> {
    return this.request(path, { ...init, method: 'GET' })
  }

  post(path: string, body?: unknown, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    let requestBody: BodyInit | undefined
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json')
      requestBody = JSON.stringify(body)
    }
    return this.request(path, { ...init, method: 'POST', headers, body: requestBody })
  }
}

export const httpClient = new HttpClient()
