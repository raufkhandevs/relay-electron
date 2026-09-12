import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queries'
import { disconnectEcho } from './echo'
import Login from './screens/Login'
import Queue from './screens/Queue'
import Thread from './screens/Thread'
import type { Ticket, User } from '../../shared/types'

function AppShell(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

  if (!user) {
    return <Login onSignedIn={setUser} />
  }

  if (selectedTicket) {
    // Keyed by ticketId so switching tickets remounts the thread instead of
    // carrying the previous ticket's live-message state into the new one.
    return (
      <Thread
        key={selectedTicket.id}
        ticket={selectedTicket}
        user={user}
        onBack={() => setSelectedTicket(null)}
      />
    )
  }

  return (
    <Queue
      user={user}
      selectedTicketId={null}
      onSelectTicket={setSelectedTicket}
      onSignedOut={() => {
        disconnectEcho()
        setUser(null)
        setSelectedTicket(null)
      }}
    />
  )
}

function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}

export default App
