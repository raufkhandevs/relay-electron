import type { CursorPaginated, Message, Paginated, Ticket, User } from '../shared/types'
import type { OutgoingAttachment } from './index'

export interface RelayApi {
  signIn: (email: string, password: string) => Promise<User>
  signOut: () => Promise<void>
  me: () => Promise<User>
  tickets: () => Promise<Paginated<Ticket>>
  messages: (ticketId: number) => Promise<CursorPaginated<Message>>
  sendMessage: (
    ticketId: number,
    body: string,
    idempotencyKey: string,
    file?: OutgoingAttachment
  ) => Promise<Message>
  channelAuth: (socketId: string, channelName: string) => Promise<unknown>
  attachmentBytes: (attachmentId: number) => Promise<Uint8Array>
}

declare global {
  interface Window {
    relay: RelayApi
  }
}
