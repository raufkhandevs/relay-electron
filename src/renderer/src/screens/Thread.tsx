import { useCallback, useEffect, useRef, useState } from 'react'
import { readableError, useMessages } from '../queries'
import { useDelayedFlag } from '../hooks'
import { getEcho } from '../echo'
import { formatTimestamp } from '../format'
import MessageComposer from '../components/MessageComposer'
import type { Message, Ticket, User } from '../../../shared/types'

const SKELETON_ROWS = 4

type PendingMessage = {
  clientId: string
  body: string
  status: 'sending' | 'failed'
}

/**
 * Subscribes to `private-ticket.{ticketId}` and calls `onMessage` for every
 * `message.created` broadcast. Leaves the channel on unmount or when `ticketId`
 * changes, so navigating between tickets never accumulates subscriptions (which
 * would otherwise render the same message several times).
 */
function useTicketChannel(ticketId: number, onMessage: (message: Message) => void): void {
  // Kept in a ref so the subscription effect only depends on ticketId, not on
  // callers passing a new inline function every render.
  const onMessageRef = useRef(onMessage)
  useEffect(() => {
    onMessageRef.current = onMessage
  })

  useEffect(() => {
    const channelName = `ticket.${ticketId}`
    const echo = getEcho()
    // The leading dot is mandatory: without it Echo expects a fully qualified PHP
    // class name for the event and matches nothing, with no error anywhere.
    echo.private(channelName).listen('.message.created', (message: Message) => {
      onMessageRef.current(message)
    })

    return () => {
      echo.private(channelName).stopListening('.message.created')
      echo.leave(channelName)
    }
  }, [ticketId])
}

export default function Thread({
  ticket,
  user,
  onBack
}: {
  ticket: Ticket
  user: User
  onBack: () => void
}): React.JSX.Element {
  const { data, isPending, isError, error, refetch } = useMessages(ticket.id)
  const showSkeleton = useDelayedFlag(isPending)
  const [liveMessages, setLiveMessages] = useState<Message[]>([])
  const [pending, setPending] = useState<PendingMessage[]>([])

  const append = useCallback(
    (incoming: Message) => {
      setLiveMessages((current) =>
        // The sender receives their own broadcast back, so a message already known
        // (from history or an earlier broadcast) must not be appended again.
        current.some((existing) => existing.id === incoming.id) ? current : [...current, incoming]
      )

      // I sent this and it just arrived over the broadcast before my own IPC call
      // resolved. Drop the matching optimistic entry so it is not shown twice;
      // the confirmed message above takes its place.
      if (incoming.author.id === user.id) {
        setPending((current) =>
          current.filter((p) => !(p.status === 'sending' && p.body === incoming.body))
        )
      }
    },
    [user.id]
  )

  useTicketChannel(ticket.id, append)

  const send = useCallback(
    (body: string, clientId: string = crypto.randomUUID()) => {
      setPending((current) => [
        ...current.filter((p) => p.clientId !== clientId),
        { clientId, body, status: 'sending' }
      ])

      window.relay
        .sendMessage(ticket.id, body, clientId)
        .then((message) => {
          setPending((current) => current.filter((p) => p.clientId !== clientId))
          append(message)
        })
        .catch(() => {
          setPending((current) =>
            current.map((p) => (p.clientId === clientId ? { ...p, status: 'failed' } : p))
          )
        })
    },
    [append, ticket.id]
  )

  const retry = useCallback(
    (clientId: string) => {
      const entry = pending.find((p) => p.clientId === clientId)
      if (entry) {
        send(entry.body, clientId)
      }
    },
    [pending, send]
  )

  const history = data?.data ?? []
  const historyIds = new Set(history.map((message) => message.id))
  // The cursor page arrives newest-first; reverse it for reading order, then append
  // anything that arrived live and isn't already part of that history.
  const messages = [
    ...history.slice().reverse(),
    ...liveMessages.filter((message) => !historyIds.has(message.id))
  ]

  return (
    <div className="screen">
      <header className="thread-header">
        <button type="button" data-testid="thread-back" onClick={onBack}>
          Back
        </button>
        <span className={`thread-header-edge thread-header-edge-${ticket.status}`} aria-hidden />
        <div className="thread-header-titles">
          <h1>{ticket.subject}</h1>
          <span className="thread-id">TKT-{ticket.id}</span>
        </div>
      </header>

      {isPending && showSkeleton && (
        <div className="message-list" data-testid="message-list-skeleton" aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div key={index} className="message-row-skeleton">
              <span className="skeleton-block" />
            </div>
          ))}
        </div>
      )}

      {!isPending && isError && (
        <div className="state-message" data-testid="thread-error">
          <p>Could not load messages: {readableError(error)}</p>
          <button type="button" data-testid="thread-retry" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {!isPending && !isError && messages.length === 0 && pending.length === 0 && (
        <div className="state-message" data-testid="thread-empty">
          <p>No messages yet.</p>
        </div>
      )}

      {!isPending && !isError && (messages.length > 0 || pending.length > 0) && (
        <ul className="message-list" data-testid="message-list">
          {messages.map((message) => (
            <li
              key={message.id}
              className={message.author.id === user.id ? 'message message-agent' : 'message'}
              data-testid={`message-${message.id}`}
            >
              <span className="message-bubble">{message.body}</span>
              <span className="message-meta">
                <span>{message.author.name}</span>
                <time>{formatTimestamp(message.created_at)}</time>
              </span>
            </li>
          ))}

          {pending.map((entry) => (
            <li
              key={entry.clientId}
              className="message message-agent"
              data-testid={`message-pending-${entry.clientId}`}
            >
              <span className="message-bubble">{entry.body}</span>
              <span className="message-meta">
                {entry.status === 'sending' ? (
                  <span>Sending…</span>
                ) : (
                  <>
                    <span className="message-meta-failed">Failed to send</span>
                    <button
                      type="button"
                      data-testid={`message-retry-${entry.clientId}`}
                      onClick={() => retry(entry.clientId)}
                    >
                      Retry
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <MessageComposer onSend={send} />
    </div>
  )
}
