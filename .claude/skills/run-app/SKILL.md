---
name: run-app
description: Start, build, package and debug the Relay Electron agent console. Use whenever this app needs running or packaging, when realtime is silent, or when something works in dev but breaks in a packaged build.
---

# Running the Relay agent console

The backend must be up first. This app is a client and does nothing without it.

```bash
cd ../backend-laravel && docker compose up -d && composer dev
npm run dev
```

The renderer dev server binds **5174**, not 5173: Laravel's Vite holds 5173 while `composer dev`
runs. If you see it pick yet another port, something else grabbed 5174.

Accounts, both password `password`: `agent@relay.test` (all five tickets), `priya@relay.test` (one).

## Which process am I in

Three, and confusing them is the usual cause of a baffling error.

- **main** is Node. Filesystem, `safeStorage`, the API client, the auth token. `src/main`.
- **preload** is the bridge. Six named methods, nothing else. `src/preload`.
- **renderer** is a browser running React. No Node, no token, no filesystem. `src/renderer`.

If the renderer needs something only main can do, add one named IPC channel with validation in
`src/main/ipc.ts` and one named method in `src/preload/index.ts`. Never a generic `invoke`.

## Screenshots do not work reliably here

`screencapture -x` grabs the whole screen and the terminal keeps focus; `osascript activate` does
not raise the window; pyobjc is not installed so the window id cannot be read from Quartz. Do not
spend time on it. Verify by other means:

- Is the dev server serving: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/`
- Did main and preload build: `ls out/main out/preload`
- Is our Electron running: `pgrep -f "desktop-electron/node_modules/electron"`
- Renderer state: add a temporary `console.log`, read it in the `npm run dev` terminal via main's
  `console-message` forwarding, then remove it.

## Realtime is silent

No error appears for any of these.

1. Is `reverb:start` running. One of the four processes in the backend's `composer dev`.
2. Does `listen()` start with a dot: `.message.created`. Without it Echo matches nothing.
3. Is the custom authorizer wired to `window.relay.channelAuth`. The default authorizer cannot work
   here, because the renderer has no credential by design.
4. Does `relay:channelAuth` return 200. A 403 means `TicketPolicy` refused, which may be correct.
5. Is `typeof Pusher` a function. Builds differ: here the default export is the class, on React
   Native it is named off the namespace. Log it rather than assuming.

## Packaging

```bash
npm run build && npx electron-builder --dir
open dist/mac-arm64/*.app
```

Do this routinely, not at release. Packaged-only bugs: absolute asset paths under `file://`, files
missing from the `files` glob, writes attempted inside the read-only app bundle.

Signing and notarisation are out of scope: they need a paid Apple Developer Program membership and
a Developer ID Application certificate. The Apple Development certificate on this machine is enough
to run locally and not enough to distribute. See `~/.claude/skills/electron-package-sign`.
