import type { CursorPaginated, Message, Paginated, Ticket, User } from '../shared/types'

export interface RelayApi {
  signIn: (email: string, password: string) => Promise<User>
  signOut: () => Promise<void>
  me: () => Promise<User>
  tickets: () => Promise<Paginated<Ticket>>
  messages: (ticketId: number) => Promise<CursorPaginated<Message>>
  channelAuth: (socketId: string, channelName: string) => Promise<unknown>
}

declare global {
  interface Window {
    relay: RelayApi
  }
}
