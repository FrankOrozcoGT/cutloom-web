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
    // Si ya hay un refresh en vuelo (disparado por otra request o por el
    // restore inicial de sesión), esperarlo ANTES de salir — así esta
    // request usa el token nuevo en vez de salir con uno viejo/vacío,
    // recibir su propio 401, y disparar un segundo refresh en carrera con
    // el primero. El backend rota el refresh token en cada uso: dos POST
    // /api/auth/refresh compitiendo pueden dejar al segundo con un 401
    // legítimo aunque la sesión siga siendo válida.
    if (this.refreshPromise && !isRetry && path !== '/api/auth/refresh') {
      await this.refreshPromise
    }

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
      this.onSessionExpired?.()
      return response
    }

    return this.request(path, init, true)
  }

  // Único punto de entrada para refrescar el access token. Tanto el 401
  // automático de request() como cualquier código externo (ej. restaurar
  // sesión al montar la app) deben pasar por acá — el backend rota el
  // refresh token en cada uso, así que dos POST /api/auth/refresh en
  // paralelo con la misma cookie hacen que el segundo reciba 401 legítimo
  // aunque la sesión siga siendo válida. Setea this.accessToken acá mismo
  // (no en el caller) para que cualquier request que esperó refreshPromise
  // ya tenga el token nuevo disponible apenas la promesa resuelve.
  async refreshAccessToken(): Promise<RefreshResult> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh()
        .then((result) => {
          this.accessToken = result?.accessToken ?? null
          return result
        })
        .finally(() => {
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

  // No fijar Content-Type acá: el navegador debe generarlo con el boundary correcto al ver un FormData.
  postForm(path: string, formData: FormData, init: RequestInit = {}): Promise<Response> {
    return this.request(path, { ...init, method: 'POST', body: formData })
  }
}

export const httpClient = new HttpClient()
