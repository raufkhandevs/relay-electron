import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queries'
import Login from './screens/Login'
import Queue from './screens/Queue'
import type { User } from '../../shared/types'

function AppShell(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)

  if (!user) {
    return <Login onSignedIn={setUser} />
  }

  return (
    <Queue
      user={user}
      selectedTicketId={selectedTicketId}
      onSelectTicket={setSelectedTicketId}
      onSignedOut={() => {
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
