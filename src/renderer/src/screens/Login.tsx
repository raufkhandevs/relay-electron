import { useState, type FormEvent } from 'react'
import { useSignIn, readableError } from '../queries'
import type { User } from '../../../shared/types'

// Prefilled in development only, so a packaged build never ships a credential default.
const isDev = import.meta.env.DEV

export default function Login({
  onSignedIn
}: {
  onSignedIn: (user: User) => void
}): React.JSX.Element {
  const [email, setEmail] = useState(isDev ? 'agent@relay.test' : '')
  const [password, setPassword] = useState(isDev ? 'password' : '')
  const signIn = useSignIn()

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    signIn.mutate({ email, password }, { onSuccess: onSignedIn })
  }

  return (
    <div className="screen screen-centered">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Relay</h1>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          data-testid="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
        />
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          data-testid="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        {signIn.isError && (
          <p className="error-message" data-testid="login-error">
            {readableError(signIn.error)}
          </p>
        )}
        <button type="submit" data-testid="login-submit" disabled={signIn.isPending}>
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
