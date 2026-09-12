import { contextBridge, ipcRenderer } from 'electron'
import type { CursorPaginated, Message, Paginated, Ticket, User } from '../shared/types'

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
  channelAuth: (socketId: string, channelName: string): Promise<unknown> =>
    ipcRenderer.invoke('relay:channelAuth', { socketId, channelName })
}

contextBridge.exposeInMainWorld('relay', relay)
