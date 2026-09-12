# Relay agent console

The desktop client for Relay, a support desk. An agent signs in, works the ticket queue, opens a
thread, replies, and sees a customer's message arrive without refreshing anything.

One of four repos. The parent, [raufkhandevs/relay](https://github.com/raufkhandevs/relay), holds
the design and decision records. The API and websocket server are in
[relay-laravel](https://github.com/raufkhandevs/relay-laravel) and must be running.

## Running it

Backend first, in its own checkout:

```bash
cd ../backend-laravel && docker compose up -d && composer dev
```

Then:

```bash
npm install
npm run dev
```

Seeded accounts, both password `password`:

| Email | Sees |
|---|---|
| `agent@relay.test` | every ticket |
| `priya@relay.test` | her own only |

Sign in as the agent, open a ticket, then post a message as Priya from the web client or over the
API. It appears in the window with no interaction.

## The one thing worth understanding here

**The auth token never reaches the renderer.**

The renderer is a browser. Anything it can read, an XSS can exfiltrate. So the token lives in the
main process, encrypted with Electron's `safeStorage` and written under `app.getPath('userData')`.
Main attaches it to every API request. `signIn` returns only the user; the token stops at the
process boundary.

That extends to websockets. The renderer cannot authorise a private channel the normal way, because
that needs the credential. Instead Echo uses a custom authorizer that asks main over IPC:

```
renderer: Echo wants private-ticket.1
  -> window.relay.channelAuth(socketId, channelName)
  -> main attaches the bearer token, calls /api/broadcasting/auth
  -> signed response returns to the renderer
```

The same `TicketPolicy` in Laravel decides, reached three different ways across this project: a
session cookie from the browser, a bearer header from the iOS Keychain, and this IPC proxy. One
rule, three trust models.

The bridge is exactly six methods (`signIn`, `signOut`, `me`, `tickets`, `messages`,
`channelAuth`). There is deliberately no generic `invoke(channel, ...args)` and `ipcRenderer` is
not exposed. Either would let a compromised renderer call any main-process handler and make every
validation rule in `src/main/ipc.ts` pointless.

## Packaging

```bash
npm run build
npx electron-builder --dir     # unsigned, unpacked, runs locally
```

Run this from week one, not release week. Bugs that only exist in packaged builds live here:
absolute asset paths under `file://`, files missing from the `files` glob, writes attempted inside
the app bundle.

## What is not done: signing and notarisation

The packaged app runs on this machine because electron-builder found an **Apple Development**
certificate already installed. That is not enough to ship.

For anyone else to open it you need a paid Apple Developer Program membership and a **Developer ID
Application** certificate, then Hardened Runtime, then notarisation, then stapling. Without that:

- macOS refuses to open the app for other users ("YourApp is damaged").
- `electron-updater` cannot complete an update, because Squirrel.Mac verifies the signature before
  swapping the bundle. It fails silently, with no error in the UI.

That work is deliberately out of scope here on cost grounds. It is written up properly in the
parent repo's `~/.claude/skills/electron-package-sign`.

## Things that will catch you out

- **The renderer dev server is on 5174**, not 5173, because Laravel's Vite takes 5173 while
  `composer dev` is running.
- **`pusher-js` exports differently per build.** Here the default export is the Pusher class. The
  React Native build names it off the namespace instead. Check with `typeof` rather than assuming;
  copying the other client's workaround would break this one.
- **`listen()` event names need a leading dot**: `.message.created`. Without it Echo expects a
  fully qualified PHP class name and matches nothing, silently.
- **Realtime silently does nothing** if Reverb is not running. It is one of four processes in the
  backend's `composer dev`.

## Design

Palette, type and the status-edge device are shared with the other two clients and defined in
the parent repo's `docs/decisions/0009-one-design-system-two-densities.md`. The customer surfaces
run the system roomy; the agent console runs it compact.
