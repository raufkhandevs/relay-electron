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

/**
 * Laravel's JSON error responses (validation failures, throttling) carry a
 * human-readable `message` field. Custom Error properties like ApiError.status
 * don't survive the ipcMain -> ipcRenderer trip, only the message text does, so
 * this is where the message needs to already be readable.
 */
async function readErrorMessage(response: Response): Promise<string> {
  if (response.status === 413) {
    // A file over the server's own upload limit is rejected before Laravel's
    // validation ever runs, with no body to read a message from.
    return 'File is too large. The limit is 10 MB.'
  }
  const body = await response.text()
  let message = body || response.statusText
  try {
    const parsed = JSON.parse(body) as { message?: unknown }
    if (typeof parsed.message === 'string') {
      message = parsed.message
    }
  } catch {
    // Not JSON; fall back to the raw body/status text already set above.
  }
  return message
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
    throw new ApiError(response.status, await readErrorMessage(response))
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
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),

  /**
   * multipart/form-data, for the one endpoint that accepts a file alongside JSON
   * fields. No 'Content-Type' header here on purpose: fetch sets the multipart
   * boundary itself, and overriding it would send a boundary-less header instead.
   */
  postMultipart: async <T>(
    path: string,
    fields: Record<string, string>,
    file?: { name: string; mime: string; bytes: Uint8Array }
  ): Promise<T> => {
    const token = getToken()
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value)
    }
    if (file) {
      form.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.mime }), file.name)
    }

    const response = await fetch(`${API_BASE}/api${path}`, {
      method: 'POST',
      body: form,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })

    if (!response.ok) {
      throw new ApiError(response.status, await readErrorMessage(response))
    }

    return response.json() as Promise<T>
  },

  /**
   * For GET /attachments/{id}: authorises, then redirects to a short-lived presigned
   * MinIO URL. fetch follows that redirect on its own, so this hands back the actual
   * bytes rather than the storage URL, and the renderer never holds a link to the
   * object store.
   *
   * `Accept` must NOT be application/json here. That endpoint content-negotiates for
   * the iOS client, which cannot read a redirect's Location without following it, and
   * answers a JSON request with {url} instead of a 302. Asking for JSON here returned
   * the signed URL as a JSON string, which the renderer then base64-encoded into a
   * data: URI and rendered as a broken image, while also defeating the point of
   * keeping that URL out of the renderer.
   */
  getBinary: async (path: string): Promise<Uint8Array> => {
    const token = getToken()
    const response = await fetch(`${API_BASE}/api${path}`, {
      headers: {
        Accept: '*/*',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })

    if (!response.ok) {
      throw new ApiError(response.status, await readErrorMessage(response))
    }

    return new Uint8Array(await response.arrayBuffer())
  }
}
