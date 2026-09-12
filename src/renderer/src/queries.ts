import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { CursorPaginated, Paginated, Ticket, Message, User } from '../../shared/types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false
    }
  }
})

/**
 * Every window.relay call that fails crosses the IPC boundary as a generic Error whose
 * message is wrapped as `Error invoking remote method '<channel>': <original>.toString()`.
 * Custom properties (ApiError.status) do not survive that trip, only the message text -
 * so main (src/main/api.ts) puts the readable text there before throwing. This just
 * strips Electron's wrapper noise back off for display.
 */
export function readableError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(
      /Error invoking remote method '[^']*':\s*(?:\w*Error:\s*)*(.*)/s
    )
    return match ? match[1] : error.message
  }
  return String(error)
}

export function useSignIn(): UseMutationResult<User, Error, { email: string; password: string }> {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      window.relay.signIn(email, password)
  })
}

export function useSignOut(): UseMutationResult<void, Error, void> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => window.relay.signOut(),
    onSuccess: () => {
      // The next signed-in user must never see the previous user's cached tickets.
      client.clear()
    }
  })
}

export function useTickets(): UseQueryResult<Paginated<Ticket>> {
  return useQuery<Paginated<Ticket>>({
    queryKey: ['tickets'],
    queryFn: () => window.relay.tickets()
  })
}

export function useMessages(ticketId: number): UseQueryResult<CursorPaginated<Message>> {
  return useQuery<CursorPaginated<Message>>({
    queryKey: ['messages', ticketId],
    queryFn: () => window.relay.messages(ticketId)
  })
}
