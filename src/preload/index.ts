import { contextBridge, ipcRenderer } from 'electron'
import type { CursorPaginated, Message, Paginated, Ticket, User } from '../shared/types'

export type OutgoingAttachment = { name: string; mime: string; bytes: Uint8Array }

// Every method here is a thin wrapper over exactly one named IPC channel.
// Deliberately no `invoke(channel, ...args)` escape hatch and no exposed
// `ipcRenderer`: either one would let a compromised renderer call any main-process
// handler, not just the ones listed below.
const relay = {
  signIn: (email: string, password: string): Promise<User> =>
    ipcRenderer.invoke('relay:signIn', { email, password }),
  signOut: (): Promise<void> => ipcRenderer.invoke('relay:signOut'),
  me: (): Promise<User> => ipcRenderer.invoke('relay:me'),
  tickets: (): Promise<Paginated<Ticket>> => ipcRenderer.invoke('relay:tickets'),
  messages: (ticketId: number): Promise<CursorPaginated<Message>> =>
    ipcRenderer.invoke('relay:messages', ticketId),
  // `file` carries raw bytes, never a filesystem path: the renderer already holds
  // the bytes for whatever the user dropped or picked, and main never reads a path
  // it was handed - see CLAUDE.md's non-negotiables.
  sendMessage: (
    ticketId: number,
    body: string,
    idempotencyKey: string,
    file?: OutgoingAttachment
  ): Promise<Message> =>
    ipcRenderer.invoke('relay:sendMessage', { ticketId, body, idempotencyKey, file }),
  channelAuth: (socketId: string, channelName: string): Promise<unknown> =>
    ipcRenderer.invoke('relay:channelAuth', { socketId, channelName }),
  // Fetches attachment bytes through /api/attachments/{id} so TicketPolicy runs on
  // every access. Returns bytes, not the presigned storage URL main resolved them
  // from, so the renderer never holds a link to the object store.
  attachmentBytes: (attachmentId: number): Promise<Uint8Array> =>
    ipcRenderer.invoke('relay:attachmentBytes', attachmentId)
}

contextBridge.exposeInMainWorld('relay', relay)
