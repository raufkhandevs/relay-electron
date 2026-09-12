import { getToken } from './auth'

export const API_BASE = 'http://localhost:8000'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()

  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init.headers,
      // Last, deliberately. No caller should be able to overwrite or unset the bearer
      // header by passing its own headers object.
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  })

  if (!response.ok) {
    const body = await response.text()
    // Laravel's JSON error responses (validation failures, throttling) carry a
    // human-readable `message` field. Custom Error properties like ApiError.status
    // don't survive the ipcMain -> ipcRenderer trip, only the message text does, so
    // this is where the message needs to already be readable.
    let message = body || response.statusText
    try {
      const parsed = JSON.parse(body) as { message?: unknown }
      if (typeof parsed.message === 'string') {
        message = parsed.message
      }
    } catch {
      // Not JSON; fall back to the raw body/status text already set above.
    }
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' })
}
