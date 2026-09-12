import type { TicketStatus } from '../../shared/types'

/**
 * Status is a 3px coloured left edge, never a pill: decision 0009. The
 * compact agent surface reads the edge alone (no status word next to it -
 * that is the point of the density contrast), so this only supplies the
 * accessible name for that edge, not a visible label.
 */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed'
}
