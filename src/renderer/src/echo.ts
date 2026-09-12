import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import type { AuthorizerGenerator, ChannelAuthorizationCallback } from 'pusher-js'

// Reverb's public app key. Not a secret - it ships to every client (the mobile and
// web clients bake the same value into their own bundles) - so it is hardcoded here
// the same way src/main/api.ts hardcodes API_BASE, rather than wired through a build-time
// env var for a single-environment dev client. Copied from backend-laravel's REVERB_APP_KEY.
const REVERB_APP_KEY = 'qft5nqtkyffsip3rjmak'
const REVERB_HOST = 'localhost'
const REVERB_PORT = 8080

let echo: Echo<'reverb'> | null = null

/**
 * Reverb speaks the Pusher protocol, so laravel-echo drives it through pusher-js - the
 * same two libraries the web and mobile clients use. On this bundler pusher-js's default
 * export is the Pusher class itself (confirmed by logging `typeof`/`Object.keys` on the
 * import before writing this; React Native's build instead names it `Pusher` off a
 * namespace object, so this is not portable to that platform unchanged).
 */
export function getEcho(): Echo<'reverb'> {
  if (echo) {
    return echo
  }

  echo = new Echo<'reverb'>({
    broadcaster: 'reverb',
    Pusher,
    key: REVERB_APP_KEY,
    wsHost: REVERB_HOST,
    wsPort: REVERB_PORT,
    forceTLS: false,
    enabledTransports: ['ws', 'wss'],
    // This client holds no cookie and must never hold the bearer token (it lives only
    // in main - see src/main/auth.ts), so it cannot use Echo's default authorizer, which
    // would post to authEndpoint with a cookie or a header straight from the renderer.
    // This authorizer instead asks main to authorize the channel over the existing
    // relay:channelAuth IPC channel and hands the signed response back to pusher-js.
    // Main attaches the bearer token; the renderer never sees it.
    authorizer: ((channel) => ({
      authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
        window.relay
          .channelAuth(socketId, channel.name)
          .then((data) => callback(null, data as Parameters<ChannelAuthorizationCallback>[1]))
          .catch((error: Error) => callback(error, null))
      }
    })) satisfies AuthorizerGenerator
  })

  return echo
}

/**
 * Tears down the live connection. Call on sign-out so the next signed-in user on this
 * machine doesn't inherit the previous user's authorised sockets.
 */
export function disconnectEcho(): void {
  echo?.disconnect()
  echo = null
}
