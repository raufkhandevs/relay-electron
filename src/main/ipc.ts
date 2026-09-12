import { ipcMain } from 'electron'
import { api } from './api'
import { clearToken, setToken } from './auth'
import type { CursorPaginated, Message, Paginated, Ticket, User } from '../shared/types'

// Every channel validates its own payload. The renderer is a browser: it is hostile
// input, not a trusted caller, even though it is our own code.

const CHANNEL_NAME_RE = /^private-ticket\.\d+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Mirrors StoreMessageRequest::rules() in the Laravel API (backend-laravel). The
// server is the real boundary; this bound just fails fast instead of shipping an
// oversized payload the API would reject anyway.
const MAX_MESSAGE_LENGTH = 5000

// Mirrors StoreMessageRequest::ALLOWED_ATTACHMENT_MIMES and its 'max:10240' rule.
// The server judges the real content regardless of what is asserted here; this is
// only a fast local rejection so an oversized or wrong-type file never leaves the
// machine to be told no by the network instead.
const ALLOWED_ATTACHMENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain'
])
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

type AttachmentPayload = { name: string; mime: string; bytes: Uint8Array }

function assertPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function assertChannelName(value: unknown): string {
  if (typeof value !== 'string' || !CHANNEL_NAME_RE.test(value)) {
    throw new Error('channelName must match private-ticket.<digits>')
  }
  return value
}

// Mirrors the API's `nullable, required_without:file` rule: a message needs a body,
// a file, or both. An empty body is valid when a file comes with it, because a photo
// often needs no caption.
function assertMessageBody(value: unknown, hasAttachment: boolean): string {
  if (typeof value !== 'string') {
    throw new Error('body must be a string')
  }
  if (value.trim().length === 0 && !hasAttachment) {
    throw new Error('body is required when no file is attached')
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`body must be at most ${MAX_MESSAGE_LENGTH} characters`)
  }
  return value
}

function assertUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID`)
  }
  return value
}

function assertAttachment(value: unknown): AttachmentPayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error('file must be {name, mime, bytes}')
  }
  const { name, mime, bytes } = value as Record<string, unknown>
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error('file bytes must be a non-empty Uint8Array')
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error('file must be at most 10 MB')
  }
  if (typeof mime !== 'string' || !ALLOWED_ATTACHMENT_MIMES.has(mime)) {
    throw new Error(`file type must be one of: ${[...ALLOWED_ATTACHMENT_MIMES].join(', ')}`)
  }
  return { name: assertString(name, 'file name'), mime, bytes }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('relay:signIn', async (_event, payload: unknown): Promise<User> => {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('signIn requires {email, password}')
    }
    const { email, password } = payload as Record<string, unknown>
    const result = await api.post<{ token: string; user: User }>('/tokens', {
      email: assertString(email, 'email'),
      password: assertString(password, 'password'),
      device_name: 'relay-desktop'
    })
    try {
      setToken(result.token)
    } catch (error) {
      // The token already exists on the server. If we cannot store it, revoke it rather
      // than leave a live credential nobody holds a reference to.
      await api.delete('/tokens/current').catch(() => undefined)
      throw error
    }
    // Only the User crosses the bridge. The token stops here.
    return result.user
  })

  ipcMain.handle('relay:signOut', async (): Promise<void> => {
    try {
      await api.delete('/tokens/current')
    } catch {
      // Best effort: an unreachable server or an already-expired token must not
      // trap the user signed in locally. Clear the stored token regardless.
    }
    clearToken()
  })

  ipcMain.handle('relay:me', async (): Promise<User> => {
    return api.get<User>('/me')
  })

  ipcMain.handle('relay:tickets', async (): Promise<Paginated<Ticket>> => {
    return api.get<Paginated<Ticket>>('/tickets')
  })

  ipcMain.handle(
    'relay:messages',
    async (_event, ticketId: unknown): Promise<CursorPaginated<Message>> => {
      const id = assertPositiveInteger(ticketId, 'ticketId')
      return api.get<CursorPaginated<Message>>(`/tickets/${id}/messages`)
    }
  )

  ipcMain.handle('relay:sendMessage', async (_event, payload: unknown): Promise<Message> => {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('sendMessage requires {ticketId, body, idempotencyKey}')
    }
    const { ticketId, body, idempotencyKey, file } = payload as Record<string, unknown>
    const id = assertPositiveInteger(ticketId, 'ticketId')
    const attachment = file === undefined || file === null ? undefined : assertAttachment(file)
    return api.postMultipart<Message>(
      `/tickets/${id}/messages`,
      {
        body: assertMessageBody(body, attachment !== undefined),
        idempotency_key: assertUuid(idempotencyKey, 'idempotencyKey')
      },
      attachment
    )
  })

  ipcMain.handle(
    'relay:attachmentBytes',
    async (_event, attachmentId: unknown): Promise<Uint8Array> => {
      const id = assertPositiveInteger(attachmentId, 'attachmentId')
      return api.getBinary(`/attachments/${id}`)
    }
  )

  ipcMain.handle('relay:channelAuth', async (_event, payload: unknown): Promise<unknown> => {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('channelAuth requires {socketId, channelName}')
    }
    const { socketId, channelName } = payload as Record<string, unknown>
    return api.post('/broadcasting/auth', {
      socket_id: assertString(socketId, 'socketId'),
      channel_name: assertChannelName(channelName)
    })
  })
}
