import { useEffect, useRef, useState } from 'react'
import { readableError, useMessages } from '../queries'
import { useDelayedFlag } from '../hooks'
import { getEcho } from '../echo'
import type { Message } from '../../../shared/types'

const SKELETON_ROWS = 4

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
  ticketId,
  onBack
}: {
  ticketId: number
  onBack: () => void
}): React.JSX.Element {
  const { data, isPending, isError, error, refetch } = useMessages(ticketId)
  const showSkeleton = useDelayedFlag(isPending)
  const [liveMessages, setLiveMessages] = useState<Message[]>([])

  useTicketChannel(ticketId, (message) => {
    setLiveMessages((current) =>
      // The sender receives their own broadcast back, so a message already known
      // (from history or an earlier broadcast) must not be appended again.
      current.some((existing) => existing.id === message.id) ? current : [...current, message]
    )
  })

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
        <h1>TKT-{ticketId}</h1>
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

      {!isPending && !isError && messages.length === 0 && (
        <div className="state-message" data-testid="thread-empty">
          <p>No messages yet.</p>
        </div>
      )}

      {!isPending && !isError && messages.length > 0 && (
        <ul className="message-list" data-testid="message-list">
          {messages.map((message) => (
            <li
              key={message.id}
              className={message.author.role === 'agent' ? 'message message-agent' : 'message'}
              data-testid={`message-${message.id}`}
            >
              <span className="message-author">{message.author.name}</span>
              <span className="message-body">{message.body}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
