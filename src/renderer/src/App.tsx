import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queries'
import { disconnectEcho } from './echo'
import Login from './screens/Login'
import Queue from './screens/Queue'
import Thread from './screens/Thread'
import type { User } from '../../shared/types'

function AppShell(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)

  if (!user) {
    return <Login onSignedIn={setUser} />
  }

  if (selectedTicketId !== null) {
    // Keyed by ticketId so switching tickets remounts the thread instead of
    // carrying the previous ticket's live-message state into the new one.
    return (
      <Thread
        key={selectedTicketId}
        ticketId={selectedTicketId}
        onBack={() => setSelectedTicketId(null)}
      />
    )
  }

  return (
    <Queue
      user={user}
      selectedTicketId={selectedTicketId}
      onSelectTicket={setSelectedTicketId}
      onSignedOut={() => {
        disconnectEcho()
        setUser(null)
        setSelectedTicketId(null)
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
