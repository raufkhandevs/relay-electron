import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { readableError, useMessages } from '../queries'
import { useDelayedFlag } from '../hooks'
import { getEcho } from '../echo'
import { formatTimestamp } from '../format'
import MessageComposer from '../components/MessageComposer'
import TypingBubble from '../components/TypingBubble'
import { FileAttachment, ImageAttachment } from '../components/Attachment'
import type { Message, Ticket, User } from '../../../shared/types'

const SKELETON_ROWS = 4

// Hide the bubble this long after the last whisper. Never wait for a
// "stopped typing" message: the sender can close the laptop or lose signal
// mid-word, and this is what keeps the bubble from getting stuck forever.
const TYPING_EXPIRY_MS = 3000

type PendingAttachment = { name: string; mime: string; bytes: Uint8Array }

type PendingMessage = {
  clientId: string
  body: string
  attachment?: PendingAttachment
  status: 'sending' | 'failed'
  error?: string
}

/**
 * Subscribes to `private-ticket.{ticketId}` and calls `onMessage` for every
 * `message.created` broadcast. Leaves the channel on unmount or when `ticketId`
 * changes, so navigating between tickets never accumulates subscriptions (which
 * would otherwise render the same message several times).
 *
 * Typing rides the same channel as a whisper: `channel.whisper()` and
 * `.listenForWhisper()` go client -> Reverb -> client and never touch Laravel,
 * so there is no IPC channel to add and no broadcast for `.listen()` to catch.
 * Both sides are wired directly against the channel instance this hook
 * already holds open.
 */
function useTicketChannel(
  ticketId: number,
  onMessage: (message: Message) => void,
  onTyping: (name: string) => void
): { whisperTyping: (name: string) => void } {
  // Kept in refs so the subscription effect only depends on ticketId, not on
  // callers passing a new inline function every render.
  const onMessageRef = useRef(onMessage)
  const onTypingRef = useRef(onTyping)
  useEffect(() => {
    onMessageRef.current = onMessage
    onTypingRef.current = onTyping
  })

  useEffect(() => {
    const channelName = `ticket.${ticketId}`
    const echo = getEcho()
    const channel = echo.private(channelName)
    // The leading dot is mandatory: without it Echo expects a fully qualified PHP
    // class name for the event and matches nothing, with no error anywhere.
    channel.listen('.message.created', (message: Message) => {
      onMessageRef.current(message)
    })
    const typingListener = ({ name }: { name: string }): void => onTypingRef.current(name)
    channel.listenForWhisper('typing', typingListener)

    return () => {
      channel.stopListening('.message.created')
      channel.stopListeningForWhisper('typing', typingListener)
      echo.leave(channelName)
    }
  }, [ticketId])

  const whisperTyping = useCallback(
    (name: string) => {
      getEcho().private(`ticket.${ticketId}`).whisper('typing', { name })
    },
    [ticketId]
  )

  return { whisperTyping }
}

function MessageAttachments({
  attachments
}: {
  attachments: Message['attachments']
}): React.JSX.Element | null {
  if (attachments.length === 0) {
    return null
  }
  return (
    <div className="message-attachments">
      {attachments.map((attachment) =>
        attachment.mime.startsWith('image/') ? (
          <ImageAttachment key={attachment.id} attachment={attachment} />
        ) : (
          <FileAttachment key={attachment.id} attachment={attachment} />
        )
      )}
    </div>
  )
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
  const [file, setFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const dragDepthRef = useRef(0)
  const [typingName, setTypingName] = useState<string | null>(null)
  const typingExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Cleared and restarted on every whisper, so the bubble only disappears
  // once TYPING_EXPIRY_MS has passed with no further whisper.
  const handleTypingReceived = useCallback(
    (name: string) => {
      if (name === user.name) {
        return
      }

      setTypingName(name)

      if (typingExpiryRef.current) {
        clearTimeout(typingExpiryRef.current)
      }
      typingExpiryRef.current = setTimeout(() => {
        setTypingName(null)
      }, TYPING_EXPIRY_MS)
    },
    [user.name]
  )

  useEffect(() => {
    return () => {
      if (typingExpiryRef.current) {
        clearTimeout(typingExpiryRef.current)
      }
    }
  }, [])

  const { whisperTyping } = useTicketChannel(ticket.id, append, handleTypingReceived)

  const sendTyping = useCallback(() => {
    whisperTyping(user.name)
  }, [whisperTyping, user.name])

  const performSend = useCallback(
    (clientId: string, body: string, attachment?: PendingAttachment) => {
      window.relay
        .sendMessage(ticket.id, body, clientId, attachment)
        .then((message) => {
          setPending((current) => current.filter((p) => p.clientId !== clientId))
          append(message)
        })
        .catch((err) => {
          setPending((current) =>
            current.map((p) =>
              p.clientId === clientId ? { ...p, status: 'failed', error: readableError(err) } : p
            )
          )
        })
    },
    [append, ticket.id]
  )

  const send = useCallback(
    async (body: string, attachedFile: File | null) => {
      const clientId = crypto.randomUUID()
      const attachment = attachedFile
        ? {
            name: attachedFile.name,
            mime: attachedFile.type,
            bytes: new Uint8Array(await attachedFile.arrayBuffer())
          }
        : undefined

      setPending((current) => [...current, { clientId, body, attachment, status: 'sending' }])
      performSend(clientId, body, attachment)
    },
    [performSend]
  )

  const retry = useCallback(
    (clientId: string) => {
      const entry = pending.find((p) => p.clientId === clientId)
      if (entry) {
        setPending((current) =>
          current.map((p) =>
            p.clientId === clientId ? { ...p, status: 'sending', error: undefined } : p
          )
        )
        performSend(clientId, entry.body, entry.attachment)
      }
    },
    [pending, performSend]
  )

  // Drag and drop onto the whole thread, not just the composer - the reason a
  // desktop client exists. A depth counter survives dragenter/dragleave firing on
  // every child element underneath the cursor, which would otherwise flicker the
  // drop-target state on and off as the pointer crosses message rows.
  const onDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDragActive(true)
  }, [])

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    // Required for the element to accept a drop at all.
    event.preventDefault()
  }, [])

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragActive(false)
    }
  }, [])

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragActive(false)
    // One file per message: anything past the first is ignored rather than queued.
    const dropped = event.dataTransfer.files[0]
    if (dropped) {
      setFile(dropped)
    }
  }, [])

  const history = data?.data ?? []
  const historyIds = new Set(history.map((message) => message.id))
  // The cursor page arrives newest-first; reverse it for reading order, then append
  // anything that arrived live and isn't already part of that history.
  const messages = [
    ...history.slice().reverse(),
    ...liveMessages.filter((message) => !historyIds.has(message.id))
  ]

  return (
    <div
      className={isDragActive ? 'screen screen-drag-active' : 'screen'}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragActive && (
        <div className="thread-dropzone-overlay" data-testid="thread-dropzone-active">
          Drop file to attach
        </div>
      )}

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

      {!isPending && !isError && messages.length === 0 && pending.length === 0 && !typingName && (
        <div className="state-message" data-testid="thread-empty">
          <p>No messages yet.</p>
        </div>
      )}

      {!isPending && !isError && (messages.length > 0 || pending.length > 0 || typingName) && (
        <ul className="message-list" data-testid="message-list">
          {messages.map((message) => (
            <li
              key={message.id}
              className={message.author.id === user.id ? 'message message-agent' : 'message'}
              data-testid={`message-${message.id}`}
            >
              <span className="message-bubble">{message.body}</span>
              <MessageAttachments attachments={message.attachments} />
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
                  <span className="message-meta-sending">
                    <span className="upload-spinner" aria-hidden="true" />
                    {entry.attachment ? `Uploading ${entry.attachment.name}…` : 'Sending…'}
                  </span>
                ) : (
                  <>
                    <span className="message-meta-failed">{entry.error ?? 'Failed to send'}</span>
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

          {typingName && <TypingBubble name={typingName} />}
        </ul>
      )}

      <MessageComposer
        file={file}
        onFileChange={setFile}
        onFileClear={() => setFile(null)}
        onSend={(body, attachedFile) => {
          send(body, attachedFile)
          setFile(null)
        }}
        onTyping={sendTyping}
      />
    </div>
  )
}
