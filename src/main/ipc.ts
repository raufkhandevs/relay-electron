import { ipcMain } from 'electron'
import { api } from './api'
import { clearToken, setToken } from './auth'
import type { CursorPaginated, Message, Paginated, Ticket, User } from '../shared/types'

// Every channel validates its own payload. The renderer is a browser: it is hostile
// input, not a trusted caller, even though it is our own code.

const CHANNEL_NAME_RE = /^private-ticket\.\d+$/

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
