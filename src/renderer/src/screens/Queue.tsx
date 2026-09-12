import { readableError, useSignOut, useTickets } from '../queries'
import { useDelayedFlag } from '../hooks'
import { formatRelativeTime } from '../format'
import { TICKET_STATUS_LABEL } from '../ticket-status'
import type { Ticket, User } from '../../../shared/types'

const SKELETON_ROWS = 5

export default function Queue({
  user,
  selectedTicketId,
  onSelectTicket,
  onSignedOut
}: {
  user: User
  selectedTicketId: number | null
  onSelectTicket: (ticket: Ticket) => void
  onSignedOut: () => void
}): React.JSX.Element {
  const { data, isPending, isError, error, refetch } = useTickets()
  const signOut = useSignOut()
  const showSkeleton = useDelayedFlag(isPending)

  function handleSignOut(): void {
    signOut.mutate(undefined, { onSuccess: onSignedOut })
  }

  return (
    <div className="screen">
      <header className="queue-header">
        <div>
          <h1>Tickets</h1>
          <p className="queue-subtitle">Signed in as {user.name}</p>
        </div>
        <button
          type="button"
          data-testid="sign-out"
          onClick={handleSignOut}
          disabled={signOut.isPending}
        >
          Sign out
        </button>
      </header>

      {isPending && showSkeleton && (
        <ul className="ticket-list" data-testid="ticket-list-skeleton" aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li key={index} className="ticket-row ticket-row-skeleton">
              <span className="skeleton-block skeleton-id" />
              <span className="skeleton-block skeleton-subject" />
              <span className="skeleton-block skeleton-status" />
            </li>
          ))}
        </ul>
      )}

      {!isPending && isError && (
        <div className="state-message" data-testid="queue-error">
          <p>Could not load tickets: {readableError(error)}</p>
          <button type="button" data-testid="queue-retry" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {!isPending && !isError && data && data.data.length === 0 && (
        <div className="state-message" data-testid="queue-empty">
          <p>No tickets.</p>
        </div>
      )}

      {!isPending && !isError && data && data.data.length > 0 && (
        <ul className="ticket-list" data-testid="ticket-list">
          {data.data.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                className={`ticket-row ticket-row-${ticket.status}`}
                aria-current={ticket.id === selectedTicketId}
                data-testid={`ticket-row-${ticket.id}`}
                title={TICKET_STATUS_LABEL[ticket.status]}
                onClick={() => onSelectTicket(ticket)}
              >
                <span className="ticket-id">TKT-{ticket.id}</span>
                <span className="ticket-subject">{ticket.subject}</span>
                <span className="ticket-activity">
                  {formatRelativeTime(ticket.last_message_at ?? ticket.created_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
